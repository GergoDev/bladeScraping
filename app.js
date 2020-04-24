const puppeteer = require("puppeteer")
const axios = require("axios")
const fs = require("fs")
const mongodb = require('mongodb')
const dotenv = require('dotenv')
dotenv.config()

async function dataScraper(browser, url, indicator) {

    let page = await browser.newPage()
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.resourceType() === 'script' || request.resourceType() === 'image')
        request.abort();
      else
        request.continue();
    });
    await page.goto(url)

    let pageBody = await page.evaluate( () => document.body.innerHTML)

    let values = pageBody.split("Highcharts.chart('graph-youtube-monthly-" + indicator + "-container', ")[1].split("data: ")[1].split(" }],")[0].slice(2).slice(0, -2).split("],[")
    let refactoredValues = values.map( value => {
        let valuesForMonth = value.split(",")
        return [new Date(Number(valuesForMonth[0])), Number(valuesForMonth[1])]
    })

    let socialLinksUrl = await page.evaluate( () => {
        let linkObjects = Array.from(document.querySelectorAll("#YouTubeUserTopSocial a"))
        return linkObjects.map(link => link.href.trim())
    })

    let youtubeUrl = socialLinksUrl.find(url => url.indexOf("youtube.com/user/") != -1 || url.indexOf("youtube.com/channel/") != -1)

    await page.close()

    return {youtubeUrl, dataFrames: [...refactoredValues]}

}

async function channelAddressScraper(url, indicator) {

    let browser = await puppeteer.launch({headless: false})
    let page = await browser.newPage()
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.resourceType() === 'script' || request.resourceType() === 'image')
        request.abort();
      else
        request.continue();
      });
    await page.goto(url)

    let sbChannelPageLinks = await page.evaluate( () => {
        let LinkObjects = Array.from(document.querySelectorAll("a"))
        let LinkObjectsHref = LinkObjects.map(link => link.href.trim())
        return LinkObjectsHref.filter( url => url.indexOf("youtube/user/") != -1)
    })

    await page.close()

    let linksPointer = 10
    let sbChannelStats = []
    //while(sbChannelPageLinks.length >= linksPointer) {
    while(10 >= linksPointer) {

        let sbChannelPagePromises = sbChannelPageLinks.slice(linksPointer-10, linksPointer).map( channelLink => dataScraper(browser, channelLink, indicator))

        sbChannelStats = sbChannelStats.concat(await Promise.all(sbChannelPagePromises))

        linksPointer += 10
    }
    

    await browser.close()

    return sbChannelStats
}

function channelDataRequest(channelId, byId) {
    return new Promise((resolve, reject) => {
  
      let params
  
      if (byId) {
        params = {
          part: "snippet,statistics",
          id: channelId,
          key: process.env.YOUTUBEAPIKEY
        }
      } else {
        params = {
          part: "snippet,statistics",
          forUsername: channelId,
          key: process.env.YOUTUBEAPIKEY
        }
      }
  
      axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params
      }).then(function (response) {
        resolve(response.data)
      }).catch(function (error) {
        reject(error)
      })
    })
  }

  async function channelIncreaseProcessor(props) {

    let { channelsFromSocialblade, indicator, dataFramesFrom, dataFramesTo, modify } = props  
    
    function tillMonthMillisecs(date) {
      let date2 = new Date(date)
      date2.setDate(1)
      date2.setHours(00)
      date2.setMinutes(00)
      date2.setSeconds(00)
      date2.setMilliseconds(000)
      return date2.getTime()
    }

    let framesForChannelsCalculated = channelsFromSocialblade.map( async channel => {
  
      if(channel.dataFrames.length != 0) {

        let channelData
        let channelId

        try {
          if (channel.youtubeUrl.indexOf("user/") != -1) {
            channelId = channel.youtubeUrl.split("user/")[1]
            channelData = await channelDataRequest(channelId, false)
          }
      
          if (channel.youtubeUrl.indexOf("channel/") != -1) {
            channelId = channel.youtubeUrl.split("channel/")[1]
            channelData = await channelDataRequest(channelId, true)
          }
        } catch(err) {
          console.log("ERROR DURING YOUTUBE API CALL FOR " + channelId)
          return undefined
        }

        if(!channelData.items.length) {
          console.log("ERROR YOUTUBE API CALL RETURNED EMPTY FOR " + channelId)
          return undefined
        }

        let framesProcessed = {}
        let actualFrameDate = new Date(dataFramesTo)
        let firstValue = true
        let lastValue = false
        let sumValues = 0
        let currentValueCount = channelData.items[0].statistics[indicator]

          while(tillMonthMillisecs(actualFrameDate) >= tillMonthMillisecs(dataFramesFrom) || lastValue) {
  
            let months = ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"]
            let frameDateStyled = `${actualFrameDate.getFullYear()} ${months[actualFrameDate.getMonth()]}`
            let channelDataFrame = channel.dataFrames.find( frame => tillMonthMillisecs(frame[0]) == tillMonthMillisecs(actualFrameDate))
                        
            if(channelDataFrame) {
              if(firstValue) {
                framesProcessed[frameDateStyled] = currentValueCount
                firstValue = false
                sumValues = channelDataFrame[1]
              } else {
                framesProcessed[frameDateStyled] = currentValueCount - sumValues
                sumValues += channelDataFrame[1]
                if(tillMonthMillisecs(actualFrameDate) == tillMonthMillisecs(dataFramesFrom)) lastValue = true
              }
            } else {
                if(lastValue) {
                  framesProcessed[frameDateStyled] = currentValueCount - sumValues
                  lastValue = false
                } else {
                  framesProcessed[frameDateStyled] = ""
                }
            }

            if(actualFrameDate.getMonth()-1 >= 0) {
                actualFrameDate.setMonth(actualFrameDate.getMonth()-1)
            } else {
                actualFrameDate.setFullYear(actualFrameDate.getFullYear()-1)
                actualFrameDate.setMonth(11)
            }
          }
  
          let channelName = channelData.items[0].snippet.title
          let channelNameMaxLength = 30
          let channelModifier = modify.find( deleteChannelId => deleteChannelId == channelData.items[0].id)
          let toModify = (channelModifier) ? {Remove: true} : {}
  
          return {
            VideoName: (channelName.length > channelNameMaxLength) ? channelName.slice(0, channelNameMaxLength).trim()+"..." : channelName,
            channelId: channelData.items[0].id,
            profilePic: channelData.items[0].snippet.thumbnails.medium.url,
            ...framesProcessed,
            ...toModify
          }
      }
    })
    
    framesForChannelsCalculated = await Promise.all(framesForChannelsCalculated)
    return framesForChannelsCalculated.filter( f => f && !f.Remove )
  }

async function channelDataFramesProcessing(MongoClient, indicator) {

    let channelsFromSocialblade = await MongoClient.db().collection(indicator + 'StatsForChannels').find().toArray()

    let minDate = new Date("2030-01-01T00:00:00.000Z")
    let maxDate = new Date("2000-01-01T00:00:00.000Z")
    channelsFromSocialblade.forEach( c => {
        if(c.dataFrames[0][0] > maxDate) maxDate = c.dataFrames[0][0]
        if(c.dataFrames[c.dataFrames.length-1][0] < minDate) minDate = c.dataFrames[c.dataFrames.length-1][0]
    })

    return await channelIncreaseProcessor({
      channelsFromSocialblade, 
        indicator,
        dataFramesFrom: minDate, 
        dataFramesTo: maxDate, 
        modify: []
    })
}

// Scraping based on: subscribers, vidviews
// Collection names: subscriberCountStatsForChannels, viewCountStatsForChannels
// https://socialblade.com/youtube/top/country/hu/mostsubscribed
// https://socialblade.com/youtube/top/country/hu/mostviewed
channelAddressScraper("https://socialblade.com/youtube/top/country/hu/mostsubscribed", "subscribers").then( statsFromSB => {
  mongodb.connect(process.env.CONNECTIONSTRING, {useNewUrlParser: true, useUnifiedTopology: true}, async function(err, client) {
    let insertResult = await client.db().collection('subscriberCountStatsForChannels').insertMany(statsFromSB)
    console.log(insertResult.insertedCount, "channel stats added.")  
    client.close()
  })
})


// Processing based on: viewCount, subscriberCount  
// let processingIndicator = "subscriberCount"
// mongodb.connect(process.env.CONNECTIONSTRING, {useNewUrlParser: true, useUnifiedTopology: true}, function(err, client) {
//   channelDataFramesProcessing(client, processingIndicator)
//   .then( res => {

//     console.log(res.length, " channels processed.")
//     let fileName = processingIndicator + "IncreaseChannel.json"
//     fs.writeFile("framesProcessed/" + fileName, JSON.stringify(res), err => {
//       if(err) throw err
//       console.log(fileName + ", Saved!")
//     }) 

//     client.close()
//   }) 
// })