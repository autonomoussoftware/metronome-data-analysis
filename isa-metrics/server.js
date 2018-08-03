'use strict'

const logger = require('bloq-service-logger')
const calculateStats = require('./src')

// Note: These blocks represents the ISA
const fromBlock = 5807765
const toBlock = 5848777

logger.info(`Initializing stats calculator from block ${fromBlock} to block ${toBlock}`)
calculateStats({ fromBlock, toBlock })
  .then(function (stats) {
    logger.info(`Stats: ${JSON.stringify(stats, null, 2)}`)
  })
  .catch(function (err) {
    logger.error('Stats calculator failed: ', err)
  })
