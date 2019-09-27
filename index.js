const http = require('http')
const https = require('https') // for the requests
const url = require('url')
const x = require('x-ray')()

// Template of what will be returned,
// is modified by updateJson and send on every request
let json = {
  titleText: 'N.O.S. Radio News',
  mainText: '',
  redirectionUrl: 'http://nos.nl/nieuws/',
}

/**
 * Get the headers from a url, following redirects
 *
 * @param {string} location The url to fetch the headers from
 * @param {number} redirects The amount of redirects followed
 * @returns {Promise} Resolves into the headers
 */
function getHeaders(location, redirects) {
  if (redirects > 20) {
    throw new Error('Too many redirects.')
  }

  return new Promise((resolve) => {
    // parse the url so we can use it in our request
    const parsed = url.parse(location)

    const options = {
      method: 'HEAD', // we only need the headers
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
    }
    https
      .request(options, (res) => {
        if (res.headers.location) {
          // redirect!
          if (!redirects) {
            redirects = 0
          }
          resolve(getHeaders(res.headers.location, redirects + 1))
          return
        }
        resolve(res.headers)
      })
      .end()
  })
}

let latestUpdate = new Date(0)

/**
 * Fetch the last modified date from the nos servers
 * and use it as the updateDate in the json
 *
 * @returns {undefined}
 */
async function updateJson() {
  // don't update if we have fetched within the last minute
  if (Date.now() - latestUpdate < 1 * 60 * 1000) {
    return
  }
  latestUpdate = Date.now()
  const streamUrlHex64 = await x(
    'https://www.nporadio1.nl/gemist',
    '.js-playlist-latest-news@data-js-source',
  )
  const streamUrl = Buffer.from(streamUrlHex64, 'base64').toString()

  const headers = await getHeaders(streamUrl)
  json = {
    ...json,
    // last modified of the mp3 is of course the updateDate of the broadcast
    updateDate: new Date(headers['last-modified']),
    // why not use the date as the unique identifier too, dates are unique
    uid: new Date(headers['last-modified']),
    streamUrl,
  }
}

async function main() {
  // create the server
  const port = process.env.PORT || 8080
  http
    .createServer(async (_req, res) => {
      // get the latest news
      await updateJson()

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write(JSON.stringify(json, null, 2))
      res.end()
    })
    .listen(port)
  // eslint-disable-next-line no-console
  console.log('Server listening on port', port)
}

main()
