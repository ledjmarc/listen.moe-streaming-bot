let Eris = require('eris')
let fs = require('fs')
let request = require('request')
let reload = require('require-reload')(require)

let config = require('./config.json')
let guilds = reload('./guilds.json')

let c = new Eris.Client(config.token)

function joinVoice (client, channel) { // Join a voice channel and start playing the stream there
    client.joinVoiceChannel(channel).then(vc => { // Join
        vc.playStream(request(config.stream)) // Play
    })
}

function setGuildChannel (client, guild, channel) { // Record a channel for the server
    var _guilds = guilds // get current config
    _guilds[guild] = channel // set the channel for this server in the new config
    fs.writeFile('guilds.json', JSON.stringify(_guilds, null, 4), 'utf-8', err => { // write the config file with the new data
        if (err) console.log(err)
    })
    guilds = reload('./guilds.json') // Reload the config file
}

function getSongInfo (callback) {
    request(config.streamInfo, (err, res, body) => {
        try { body = JSON.parse(body); } catch (e) { err = e }
        if (!err) { // \o/
            callback(null, body)
        } else { // shit
            callback(err);
        }
    })
}

c.on('ready', () => {
    console.log('Connected.')

    // This code has no practical value, but it's fun so w/e
    var useSongName = true;
    function updateGame () {
        if (useSongName) {
            getSongInfo((err, body) => {
                if (!err) {
                    c.editGame({name: `${body.artist} // ${body.song}`})
                } else {
                    c.editGame({name: 'music probably'})
                }
            })
            useSongName = false // next update will not use this
            console.log('Edited - current song')
        } else {
            c.editGame({name: `on ${ c.guilds.size } servers`})
            useSongName = true // next update will use other thing
            console.log('Edited - server count')
        }
    }
    updateGame();
    setInterval(updateGame, config.gameInterval);

    // end useless code - begin code that does useful things
    // (I could get into an argument about relative usefulness here but I'll leave that for another unnecessary comment)
    for (let guild of Object.keys(guilds)) { // loop through all the servers recorded
        let channel = guilds[guild] // Get the channel for each
        joinVoice(c, channel) // Connect and play
    }
})

c.on('messageCreate', (msg) => { // Commands 'n' shit
    if (!msg.channel.guild) return // throw out PMs
    if (msg.content.startsWith("~~join")) { // Join command - joins the VC the user is in, and sets that as the music channel for the server
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
    } else if (msg.content.startsWith("~~np") || msg.content.startsWith("~~nowplaying") || msg.content.startsWith("~~playing")) { //lol
        // Now playing - Returns info about the currently playing song
        getSongInfo((err, info) => {
            if (!err) {
                c.createMessage(msg.channel.id, `**Now playing:** "${info.song}" by ${info.artist}\n${
                    info.request ? `**Requested by:** ${info.request} (<https://forum.listen.moe/u/${info.request}>)` : ''
                    //3deep5me
                    // seriously though there's gotta be a better way to do this shit
                }`)
            }
        })
    }
})

c.connect()

/*

TODO's
- Update played game text with title of current song - GET https://listen.moe/info.txt
- Require "manage server" permission to set the server's channel, so users can't move the bot around
- Make code less shit

*/
