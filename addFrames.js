const mongodb = require('mongodb')
const dotenv = require('dotenv')
dotenv.config()

let channelUrl = "https://youtube.com/channel/UConcWaTXEhp5TbFQOxA97QQ"
let dataFramesToInsert = [
    [
        new Date("2020-05-29T04:00:00.000Z"),
        333333
    ],
    [
        new Date("2020-05-29T04:00:00.000Z"),
        4444444
    ]
]

mongodb.connect(process.env.CONNECTIONSTRING, {useNewUrlParser: true, useUnifiedTopology: true}, async function(err, client) {
    let channels = client.db().collection('subscriberCountStatsForChannels')

    let channelData = await channels.find({youtubeUrl: channelUrl}).toArray()

    let newDataFrames = channelData[0].dataFrames.concat(dataFramesToInsert)

    let dbResult = await channels.updateOne({youtubeUrl: channelUrl}, {$set: {dataFrames: newDataFrames}})

    console.log(dbResult.modifiedCount, "document modified")

    client.close()
})