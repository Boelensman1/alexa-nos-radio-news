const http = require('http')
const https = require('https') // for the requests
const url = require('url')

// the location of the last nos radio news broadcast
const streamUrl = 'https://download.omroep.nl/nos/radionieuws/nosnieuws_bulalg.mp3'

// Template of what will be returned,
// is modified by updateDate and send on every request
const jsonTemplate = {
  titleText: 'N.O.S. Radio News',
  mainText: '',
  streamUrl: streamUrl,
  redirectionUrl: 'http://nos.nl/nieuws/'
}

/**
 * Get the headers from a url, following redirects
 *
 * @param {string} location The url to fetch the headers from
 * @param {number} redirects The amount of redirects followed
 * @returns {Promise} Resolves into the headers
 */
function getHeaders (location, redirects) {
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
      path: parsed.path
    }
    https.request(options, (res) => {
      if (res.headers.location) {
        // redirect!
        if (!redirects) { redirects = 0 }
        return resolve(getHeaders(res.headers.location, redirects + 1))
      }
      resolve(res.headers)
    }).end()
  })
}

/**
 * Fetch the last modified date from the nos servers
 * and use it as the updateDate in the json
 *
 * @returns {undefined}
 */
function updateDate () {
  return getHeaders(streamUrl).then((headers) => {
    // last modified of the mp3 is of course the updateDate of the broadcast
    jsonTemplate.updateDate = new Date(headers['last-modified'])
    // why not use the date as the unique identifier too, date's are unique
    jsonTemplate.uid = jsonTemplate.updateDate
  })
}

// update the date every 5 minutes
setInterval(() => {
  updateDate()
}, 5 * 60 * 1000) // amount of seconds in 5 minutes
updateDate()

// create the server
const port = process.env.PORT || 8080
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json'})
  res.write(JSON.stringify(jsonTemplate, null, 2))
  res.end()
}).listen(port)
console.log('Server listening on port', port)
