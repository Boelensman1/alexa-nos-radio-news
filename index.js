const url = require('url')
const http = require('http')
const fetch = require('node-fetch')
const puppeteer = require('puppeteer')

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

const promiseWithTimeout = (timeoutMs, promise) => {
  let timeoutHandle
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error('Promise timed out')),
      timeoutMs,
    )
  })

  return Promise.race([promise, timeoutPromise]).then((result) => {
    clearTimeout(timeoutHandle)
    return result
  })
}

const getAudioFileLocationPromise = async (page) => {
  await page.setRequestInterception(true)

  return () =>
    new Promise((resolve) => {
      page.on('request', (interceptedRequest) => {
        const url = interceptedRequest.url()
        if (url.endsWith('bulalg.mp3')) {
          // it's the audio file!
          resolve(url)
        }
        interceptedRequest.continue()
      })
    })
}

/**
 * Fetch the latest audio from the NOS servers
 *
 * @returns {Promise<void>}
 */
async function updateAudio() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_LOCATION,
    defaultViewport: {
      width: 1440,
      height: 700,
    },
    args: ['--disable-features=site-per-process'],
  })

  try {
    const page = await browser.newPage()
    await page.goto('https://www.nporadio1.nl/uitzendingen', {
      waitUntil: 'networkidle2',
    })
    const [consentToCookie] = await page.$x(
      "//button[contains(., 'accepteren')]",
    )
    await consentToCookie.click({
      waitUntil: 'networkidle2',
    })
    await page.waitForXPath("//button[contains(., 'Laatste journaal')]")

    const audioFileLocationPromise = (await getAudioFileLocationPromise(page))()

    const [button] = await page.$x("//button[contains(., 'Laatste journaal')]")
    await button.click({
      waitUntil: 'networkidle2',
    })

    const audioUrl = await promiseWithTimeout(20000, audioFileLocationPromise)
    await browser.close()

    const newAudioFile = await fetch(audioUrl).then((res) => res.buffer())
    // only update if we succesfully fetched
    if (newAudioFile.length > 100) {
      audioFile = newAudioFile
      lastUpdate = new Date()
    }
  } catch (e) {
    console.error(e)
  } finally {
    // close browser
    await browser.close()
  }
}

/**
 * Fetch the latest news if needed
 *
 * @returns {Promise<void>}
 */
function updateAudioIfNeeded() {
  // don't update if we last updated less then 5 minutes ago
  if (Date.now() - lastUpdate > 5 * 60 * 1000) {
    // only update once
    lastUpdate = new Date()

    return updateAudio()
  }
  return Promise.resolve()
}

async function main() {
  // create the server
  const port = process.env.PORT || 8080
  http
    .createServer(async (req, res) => {
      switch (req.url) {
        case '/':
          await updateAudioIfNeeded()
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

  updateAudioIfNeeded() // get the latest news
}

main()
