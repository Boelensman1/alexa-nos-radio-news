const http = require('http')
const https = require('https') // for the requests
const url = require('url')
const x = require('x-ray')()

// Template of what will be returned,
// is modified by updateDate and send on every request
const jsonTemplate = {
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

/**
 * Fetch the last modified date from the nos servers
 * and use it as the updateDate in the json
 *
 * @returns {undefined}
 */
async function updateDate() {
  const streamUrlHex64 = await x(
    'https://www.nporadio1.nl/gemist',
    '.js-playlist-latest-news@data-js-source',
  )
  const streamUrl = Buffer.from(streamUrlHex64, 'base64').toString()

  return getHeaders(streamUrl).then((headers) => {
    // last modified of the mp3 is of course the updateDate of the broadcast
    jsonTemplate.updateDate = new Date(headers['last-modified'])
    // why not use the date as the unique identifier too, dates are unique
    jsonTemplate.uid = jsonTemplate.updateDate
    jsonTemplate.streamUrl = streamUrl
  })
}

// update the date every minute
setInterval(() => {
  updateDate()
}, 1 * 60 * 1000) // amount of milliseconds in 1 minute

async function main() {
  // update the date now
  await updateDate()

  // create the server
  const port = process.env.PORT || 8080
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write(JSON.stringify(jsonTemplate, null, 2))
      res.end()
    })
    .listen(port)
  // eslint-disable-next-line no-console
  console.log('Server listening on port', port)
}

main()
