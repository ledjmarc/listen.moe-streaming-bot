let Eris = require('eris')
let fs = require('fs')
let request = require('request')
let reload = require('require-reload')(require)

let config = require('./config.json')

// If the guilds file doesn't exist, we need to create it before we can use it
try {
    fs.accessSync('guilds.json', fs.F_OK) // Try to access the file
} catch (e) { // The file isn't there
    fs.writeFileSync('guilds.json', '{}', 'utf-8') // Create the file with a blank object
}
let guilds = reload('./guilds.json') // Now that the file definitely exists, we're safe to require it

let c = new Eris.Client(config.token)

function joinVoice (client, channel) { // Join a voice channel and start playing the stream there
    client.joinVoiceChannel(channel).then(vc => { // Join
        vc.playStream(request(config.stream)) // Play
    })
}

function setGuildChannel (client, guild, channel) { // Record a channel for the server
    var _guilds = guilds // get current config
    _guilds[guild] = _guilds[guild] || {} // create server config if it doesn't already exist
    _guilds[guild].vc = channel // set the channel for this server in the new config
    fs.writeFile('guilds.json', JSON.stringify(_guilds, null, 4), 'utf-8', err => { // write the config file with the new data
        if (err) console.log(err)
    })
}

function getSongInfo (callback) { // Get the stream's info for the current song
    request(config.streamInfo, (err, res, body) => {
        try { body = JSON.parse(body) } catch (e) { err = e }
        if (!err) { // \o/
            return callback(null, body)
        } else { // shit
            return callback(err)
        }
    })
}

function memberHasManageGuild (member) { // Return whether or not the user can manage the server (this is the basis for command permissions)
    return member.permission.json.manageGuild
}

c.on('ready', () => {
    console.log(`Connected as ${c.user.username} / Currently in ${c.guilds.size} servers`)

    // This code has no practical value, but it's fun so w/e
    var useSongName = true
    function updateGame () {
        if (useSongName) {
            getSongInfo((err, body) => {
                if (!err) {
                    c.editGame({name: `${body.artist_name} // ${body.song_name}`})
                } else {
                    c.editGame({name: 'music probably'})
                }
            })
            useSongName = false // next update will not use this
        } else {
            c.editGame({name: `on ${ c.guilds.size } servers`})
            useSongName = true // next update will use other thing
        }
    }
    updateGame()
    setInterval(updateGame, config.gameInterval)

    // end useless code - begin code that does useful things
    // (I could get into an argument about relative usefulness here but I'll leave that for another unnecessary comment)
    for (let guild of Object.keys(guilds)) { // loop through all the servers recorded
        let channel = guilds[guild].vc // Get the channel for this guild
        if (channel) joinVoice(c, channel) // Connect and play if there's one set
    }
})

c.on('messageCreate', (msg) => { // Commands 'n' shit
    if (!msg.channel.guild) return // throw out PMs
    if (msg.content.startsWith("~~join")) {
        // Join command - joins the VC the user is in, and sets that as the music channel for the server
        // Requires manage server
        if (!memberHasManageGuild(msg.member)) {
            c.createMessage(msg.channel.id, "You can't do that, gotta have the 'manage server' permission.")
            return
        }
        let member = msg.member
        let channelId = member.voiceState ? member.voiceState.channelID : null
        if (!channelId) {
            // fail
            c.createMessage(msg.channel.id, 'Join a voice channel first!')
        } else {
            // oh dang hello
            setGuildChannel(c, msg.channel.guild.id, channelId)
            joinVoice(c, channelId)
            c.createMessage(msg.channel.id, '\\o/')
        }
    } else if (msg.content.startsWith("~~np") || msg.content.startsWith("~~nowplaying") || msg.content.startsWith("~~playing")) { //lol
        // Now playing - Returns info about the currently playing song
        getSongInfo((err, info) => {
            if (!err) {
                c.createMessage(msg.channel.id, `**Now playing:** "${info.song_name}" by ${info.artist_name}\n${
                    info.request ? `**Requested by:** ${info.requested_by} (<https://forum.listen.moe/u/${info.requested_by}>)` : ''
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
- Find more things to do

*/
