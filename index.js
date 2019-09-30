const url = require('url')
const http = require('http')
const fetch = require('node-fetch')
const x = require('x-ray')()

// Base JSON Template of what will be returned,
// is modified by updateDate and send on every request
const jsonTemplate = {
  titleText: 'N.O.S. Radio News',
  mainText: '',
  redirectionUrl: 'http://nos.nl/nieuws/',
  streamUrl: url.resolve(process.env.BASE_URL || '', '/stream'),
}

let audioFile = ''
let lastUpdate = new Date(0)

/**
 * Fetch the latest news from the NOS servers
 *
 * @returns {Promise<void>}
 */
async function updateAudio() {
  // don't update if we last updated less then a minute ago
  if (Date.now() - lastUpdate > 1 * 60 * 1000) {
    const streamUrlHex64 = await x(
      'https://www.nporadio1.nl/gemist',
      '.js-playlist-latest-news@data-js-source',
    )
    const audioUrl = Buffer.from(streamUrlHex64, 'base64').toString()
    const newAudioFile = await fetch(audioUrl).then((res) => res.buffer())
    // only update if we succesfully fetched
    if (newAudioFile.length > 100) {
      audioFile = newAudioFile
      lastUpdate = new Date()
    }
  }
}

async function main() {
  // create the server
  const port = process.env.PORT || 8080
  http
    .createServer(async (req, res) => {
      switch (req.url) {
        case '/':
          await updateAudio() // get the latest news
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.write(
            JSON.stringify({
              ...jsonTemplate,
              updateDate: lastUpdate.toISOString(),
              // why not use the date as the unique identifier too
              // unix timestamps should be unique
              uid: lastUpdate.getTime(),
            }),
          )
          res.end()
          break
        case '/stream':
          res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
          // stream the latest saved audio
          res.write(audioFile, 'binary')
          res.end(null, 'binary')
          break
        default:
          res.writeHead(404)
          res.end()
          break
      }
    })
    .listen(port)
  // eslint-disable-next-line no-console
  console.log('Server listening on port', port)
}

main()
