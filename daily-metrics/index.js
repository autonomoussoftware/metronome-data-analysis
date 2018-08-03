/* eslint-disable no-console */

'use strict'

const { concat, map, meanBy, negate, sumBy, uniqBy } = require('lodash')
const debug = require('debug')('met-daily-dataminer')
const jsonToCSV = require('json-to-csv')
const MetronomeContracts = require('metronome-contracts')
const pMemoize = require('p-memoize')
const Web3 = require('web3')

const createFindBlockAt = require('./find-block-at')

const DAY_MS = 86400000

const web3 = new Web3('https://eth.wallet.metronome.io:8545')
const contracts = new MetronomeContracts(web3)

const findBlockAt = pMemoize(createFindBlockAt(web3))

const getBlocksForDay = time => Promise.all([
  findBlockAt(time),
  findBlockAt(time + DAY_MS)
])
  .then(([start, end]) => ({ fromBlock: start, toBlock: end - 1 }))

const getEvents = (contract, event) => function ({ fromBlock, toBlock }) {
  debug('Getting events', event, fromBlock, toBlock)
  return contract.getPastEvents(event, { fromBlock, toBlock })
}

const getTransfers = getEvents(
  contracts.metToken,
  'Transfer'
)
const getConvertEthToMets = getEvents(
  contracts.autonomousConverter,
  'ConvertEthToMet'
)
const getConvertMetToEths = getEvents(
  contracts.autonomousConverter,
  'ConvertMetToEth'
)

const eq = (addr1, addr2) => addr1.toLowerCase() === addr2.toLowerCase()

const isAuction = event =>
  eq(event.returnValues._from, '0x0000000000000000000000000000000000000000')

const isConverter = event =>
  eq(event.returnValues._from, contracts.autonomousConverter.options.address) ||
  eq(event.returnValues._to, contracts.autonomousConverter.options.address)

const toFloat = str => Number.parseFloat(str)

const getStatsForDay = time => getBlocksForDay(time)
  .then(range => Promise.all([
    getConvertEthToMets(range),
    getConvertMetToEths(range),
    getTransfers(range)
  ]))
  .then(function ([convertEthEvents, convertMetEvents, transferEvents]) {
    const transfers = transferEvents
      .filter(negate(isConverter))
      .filter(negate(isAuction))

    return {
      date: new Date(time).toISOString(),
      converterVolume: sumBy(concat(
        map(convertEthEvents, 'returnValues.met'),
        map(convertMetEvents, 'returnValues.met')
      ), toFloat) / 1e18,
      transfersCount: transfers.length,
      transfersValueAvg: meanBy(
        map(transfers, 'returnValues._value'),
        toFloat
      ) / 1e18,
      transferAccounts: uniqBy(concat(
        map(transfers, 'returnValues._from'),
        map(transfers, 'returnValues._to')
      )).length
    }
  })

const startTime = new Date('2018-06-25T00:00:00.000Z').getTime()
const endTime = new Date(new Date().setHours(0, 0, 0, 0))

const dates = new Array(Math.floor((endTime - startTime) / DAY_MS))
  .fill()
  .map((_, i) => startTime + DAY_MS * i)

Promise.all(dates.map(getStatsForDay))
  .then(function (data) {
    debug('Data', data)
    const filename = 'met-daily.csv'
    return jsonToCSV(data, filename)
      .then(function () {
        console.log('CSV data written', filename)
      })
  })
  .catch(console.error)
  .then(process.exit)
