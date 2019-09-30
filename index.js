const http = require('http')
const fetch = require('node-fetch')
const x = require('x-ray')()

// Template of what will be returned,
// is modified by updateDate and send on every request
const jsonTemplate = {
  titleText: 'N.O.S. Radio News',
  mainText: '',
  redirectionUrl: 'http://nos.nl/nieuws/',
}

let audioFile = ''

/**
 * Fetch the last modified date from the nos servers
 * and use it as the updateDate in the json
 *
 * @returns {Promise<object>}
 */
async function getJson() {
  const streamUrlHex64 = await x(
    'https://www.nporadio1.nl/gemist',
    '.js-playlist-latest-news@data-js-source',
  )
  const audioUrl = Buffer.from(streamUrlHex64, 'base64').toString()
  audioFile = await fetch(audioUrl).then((res) => res.buffer())


  return {
    ...jsonTemplate,
    // last modified is now
    updateDate: Date.now(),
    // why not use the date as the unique identifier too, dates are unique
    uid: Date.now(),
    streamUrl: '/stream',
  }
}

async function main() {
  // create the server
  const port = process.env.PORT || 8080
  http
    .createServer(async (req, res) => {
      // get the latest news
      const json = await getJson()

      switch (req.url) {
        case '/':
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.write(JSON.stringify(json, null, 2))
          res.end()
          break
        case '/stream':
          res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
          res.write(audioFile, 'binary')
          res.end(null, 'binary')
          break
        default:
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.write(JSON.stringify({ error: 'unknown endpoint' }, null, 2))
          res.end()
          break
      }
    })
    .listen(port)
  // eslint-disable-next-line no-console
  console.log('Server listening on port', port)
}

main()
