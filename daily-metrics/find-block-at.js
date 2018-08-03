'use strict'

const debug = require('debug')('find-block-at')
const pRetry = require('p-retry')

const SEC_MS = 1000 // 1 sec
const BLOCKS_MS = 15000 // 15 secs
const RETRIES = 15

const toMs = unix => unix * SEC_MS

const getBlock = (web3, number) => pRetry(
  () => web3.eth.getBlock(number),
  { retries: RETRIES }
)

function createFindBlockAt (web3) {
  const findBlockAround = (time, hint) => getBlock(web3, hint)
    .then(function ({ number, timestamp }) {
      debug('Checking', number)
      const diff = Math.ceil((toMs(timestamp) - time) / BLOCKS_MS)
      if (Math.abs(diff) > 3) {
        return findBlockAround(time, hint - diff)
      }
      return number
    })

  const findBlockAfter = (time, hint) => getBlock(web3, hint)
    .then(function ({ number, timestamp }) {
      debug('Checking', number, new Date(timestamp * SEC_MS))
      if (toMs(timestamp) < time) {
        return hint + 1
      }
      return findBlockAfter(time, hint - 1)
    })

  const findBlockAt = time => web3.eth.getBlockNumber()
    .then(function (number) {
      debug('Starting search', number)
      return findBlockAround(time, number)
    })
    .then(function (number) {
      debug('Refining search', number)
      return findBlockAfter(time, number + 3)
    })

  return findBlockAt
}

module.exports = createFindBlockAt
