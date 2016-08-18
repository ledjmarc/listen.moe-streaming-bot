let Eris = require('eris')
let fs = require('fs')
let request = require('request')
let reload = require('require-reload')(require)

let config = require('./config.json')
let guilds = reload('./guilds.json')

let c = new Eris.Client(config.token)

function joinVoice(client, channel) { // Join a voice channel and start playing the stream there
    client.joinVoiceChannel(channel).then(vc => { // Join
        vc.playStream(request(config.stream)) // Play
    })
}

function setGuildChannel(client, guild, channel) { // Record a channel for the server
    var _guilds = guilds // get current config
    _guilds[guild] = channel // set the channel for this server in the new config
    fs.writeFile('guilds.json', JSON.stringify(_guilds, null, 4), 'utf-8', err => { // write the config file with the new data
        if (err) console.log(err)
    })
    guilds = reload('./guilds.json') // Reload the config file
}

c.on('ready', () => {
    console.log('Connected.')
    for (let guild of Object.keys(guilds)) { // loop through all the servers recorded
        let channel = guilds[guild] // Get the channel for each
        joinVoice(c, channel) // Connect and play
    }
})

c.on('messageCreate', (msg) => {
    if (!msg.channel.guild) return // throw out PMs
    if (msg.content === "!join") { // Join command - joins the VC the user is in, and sets that as the music channel for the server
        let member = msg.member
        let channelId = member.voiceState ? member.voiceState.channelID : null
        if (!channelId) {
            // fail
            c.createMessage(msg.channel.id, 'Join a voice channel first!')
        } else {
            // oh dang hello
            console.log(msg.channel.guild.id + "/" + channelId)
            setGuildChannel(c, msg.channel.guild.id, channelId)
            joinVoice(c, channelId)
            c.createMessage(msg.channel.id, '\\o/')
        }
    }
})

c.connect()

/*

TODO's
- Update played game text with title of current song - GET https://listen.moe/info.txt
- Require "manage server" permission to set the server's channel, so users can't move the bot around
- Make code less shit

*/
