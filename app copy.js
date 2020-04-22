const puppeteer = require("puppeteer")

async function dataScraper(browser, url) {

    let page = await browser.newPage()
    await page.goto(url)

    let pageBody = await page.evaluate( () => document.body.innerHTML)

    let values = pageBody.split("Highcharts.chart('graph-youtube-monthly-vidviews-container', ")[1].split("data: ")[1].split(" }],")[0].slice(2).slice(0, -2).split("],[")
    let refactoredValues = values.map( value => {
        let valuesForMonth = value.split(",")
        return [new Date(Number(valuesForMonth[0])), Number(valuesForMonth[1])]
    })

    let socialLinksUrl = await page.evaluate( () => {
        let linkObjects = Array.from(document.querySelectorAll("#YouTubeUserTopSocial a"))
        return linkObjects.map(link => link.href.trim())
    })

    let youtubeUrl = socialLinksUrl.find(url => url.indexOf("youtube.com/user/") != -1 || url.indexOf("youtube.com/channel/") != -1)

    //page.close()

    return {youtubeUrl, dataFrames: [...refactoredValues]}

}

async function channelAddressScraper(url) {

    let browser = await puppeteer.launch({headless: false})
    let page = await browser.newPage()
    await page.goto(url)

    let sbChannelPageLinks = await page.evaluate( () => {
        let LinkObjects = Array.from(document.querySelectorAll("a"))
        let LinkObjectsHref = LinkObjects.map(link => link.href.trim())
        return LinkObjectsHref.filter( url => url.indexOf("youtube/user/") != -1)
    })

    page.close()

    let sbChannelPagePromises = sbChannelPageLinks.slice(0, 5).map( channelLink => dataScraper(browser, channelLink))

    let result = await Promise.all(sbChannelPagePromises)

    browser.close()

    return result
}

console.time("time")
channelAddressScraper("https://socialblade.com/youtube/top/country/hu/mostviewed").then( res => {
    console.log(res)
    console.timeEnd("time")
})