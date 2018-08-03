'use strict'

const Web3 = require('web3')
const MetronomeContracts = require('metronome-contracts')
const _ = require('lodash')
const d3 = require('d3-array')
const pProps = require('p-props')
const pMap = require('p-map')
const pRetry = require('p-retry')
const pTimeout = require('p-timeout')
const config = require('config')
const logger = require('bloq-service-logger')

const web3 = new Web3(config.eth.url)
const metronomeContracts = new MetronomeContracts(web3, config.eth.net)

function retry (fn) {
  return pRetry(fn, {
    retries: config.eth.retries,
    onFailedAttempt: err => logger.warn(
      `Attempt ${err.attemptNumber} to get transaction and receipt failed: ${err}`
    )
  })
}

function getTransaction (hash) {
  return pTimeout(web3.eth.getTransaction(hash), config.eth.timeout)
    .then(transaction => ({ gasPrice: Number.parseFloat(transaction.gasPrice) }))
}

function getTransactionReceipt (hash) {
  return pTimeout(web3.eth.getTransactionReceipt(hash), config.eth.timeout)
    .then(receipt => ({ gasUsed: receipt.gasUsed, from: receipt.from }))
}

function mapTransfers (transfer, index, total) {
  const progress = `${index + 1}/${total}`
  logger.verbose(`Getting transaction and receipt ${transfer.transactionHash} - ${progress}`)
  return pProps({
    event: {
      returnValues: {
        _value: Number.parseFloat(transfer.returnValues._value)
      }
    },
    transaction: retry(() => getTransaction(transfer.transactionHash)),
    receipt: retry(() => getTransactionReceipt(transfer.transactionHash))
  })
}

function calculateStats ({ fromBlock, toBlock }) {
  logger.verbose(`Starting to calculate ${toBlock - fromBlock} blocks stats`)
  return metronomeContracts.metToken
    .getPastEvents('Transfer', { fromBlock, toBlock })
    .then(function (transfers) {
      logger.verbose(`${transfers.length} transfer events found, requesting transactions and receipts`)
      return transfers
    })
    .then(transfers => pMap(
      transfers,
      (...args) => mapTransfers(...args, transfers.length),
      { concurrency: config.eth.concurrency })
    )
    .then(function (transfers) {
      logger.verbose(`Calculating stats for ${transfers.length} transfers`)
      // - Number of purchases across the auction
      // - Average and median amount of MET per purchase
      // - Number of unique addresses that participated
      // - Average fee paid
      return {
        transactionsCount: transfers.length,
        uniqueAddresses: _.uniqBy(transfers, 'receipt.from').length,
        medianMETAmount: d3.median(transfers, transfer => transfer.event.returnValues._value) / 1e18,
        averageMETAmount: d3.mean(transfers, transfer => transfer.event.returnValues._value) / 1e18,
        averageFeePaid: d3.mean(transfers, transfer => transfer.receipt.gasUsed * transfer.transaction.gasPrice) / 1e18
      }
    })
}

module.exports = calculateStats
