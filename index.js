let Eris = require('eris')
let fs = require('fs')
let request = require('request')
let merge = require('merge')
let reload = require('require-reload')(require)
let childProcess = require('child_process')

let config = require('./config.json')

// If the guilds file doesn't exist, we need to create it before we can use it
try {
    fs.accessSync('guilds.json', fs.F_OK) // Try to access the file
} catch (e) { // The file isn't there
    fs.writeFileSync('guilds.json', '{}', 'utf-8') // Create the file with a blank object
}
let guilds = reload('./guilds.json') // Now that the file definitely exists, we're safe to require it

let c = new Eris.Client(config.token)
let stream

// The following two functions have been taken and modified slightly from abalabahaha/Eris. Credit goes to them.
function pickCommand () {
    for (let command of ["./ffmpeg", "./avconv", "ffmpeg", "avconv"]) {
        if(!childProcess.spawnSync(command, ["-h"]).error) {
            return command
        }
    }
    throw new Error("Neither ffmpeg nor avconv was found. Make sure you install either one, and check that it is in your PATH")
}

function loadStream (url, ua) { // Loads a network stream as a PCM stream
    let converterCommand = pickCommand()
	
    let encoder = childProcess.spawn(converterCommand, [
        "-analyzeduration", "0",
        "-vn",
        "-loglevel", "0",
        "-i", url,
        "-f", "s16le",
        "-ar", "48000",
		"-headers", "'User Agent: \"" + ua + "\"'",
        "pipe:1"
    ], {
        stdio: ["pipe", "pipe", "pipe"]
    })

    let killEncoder = (e) => {
        console.log("Encoder died for some reason...")
        let after = () => {
            if((e instanceof Error)) {
                this.emit("error", e)
            }
        }

        if(encoder.killed) {
            after()
        } else {
            encoder.once("exit", after)
            encoder.kill()
        }
    }

    encoder.stderr.on("data", (e) => {
        this.emit("error", new Error("Encoder error: " + String(e)))
    })

    encoder.once("exit", killEncoder)
    encoder.stdin.once("error", killEncoder)
    encoder.stdout.once("error", killEncoder)

    return encoder.stdout
}

function joinVoice (client, guild, channel) { // Join a voice channel and start playing the stream there
    cc = client.voiceConnections.find(vc => vc.id === guild) // Find a current connection in this guild
    if (cc) { // If there is one
        cc.switchChannel(channel) // Just switch the channel for this connection
    } else { // Looks like we'll need to make a new one
        client.joinVoiceChannel(channel).then((vc) => { // Join
			vc.playRawStream(stream, { inlineVolume: true })
        })
    }
}

function writeGuildConfig (guild, object) { // Change a guild's config via an object of options, and save the changes
    var currentConfig = guilds[guild] || {} // Get gurrent config for this guild, creating it if it doesn't exist
    var newConfig = merge(currentConfig, object) // Merge new options with current
    var _guilds = guilds
    _guilds[guild] = newConfig // Write this new config back to the config
    fs.writeFile('guilds.json', JSON.stringify(_guilds), 'utf-8', err => { // Store the new stuff in the file
        if (err) console.log(err)
        else guilds = reload('./guilds.json') // Reload the file
    })
}

function getGuildConfig (guild, option) { // Get a config option from a guild
    let defaults = config.guildDefaults // Grab the defaults, just in case
    if (!guilds[guild]) return defaults[option]
    else if (!guilds[guild][option]) return defaults[option]
    else return guilds[guild][option] // logic whee
}

function getSongInfo (callback) { // Get the stream's info for the current song
    request(config.streamInfo, {headers: {'User-Agent': config.ua}}, (err, res, body) => {
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
	stream = loadStream(config.stream, config.ua)
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
        if (channel) joinVoice(c, guild, channel) // Connect and play if there's one set
    }
})

c.on('messageCreate', (msg) => { // Commands 'n' shit
    var content = msg.content
    let channel = msg.channel.id
    let guild = msg.channel.guild
    let isPrivate = guild ? false : true
    if (!isPrivate) guild = guild.id
    let prefix = getGuildConfig(guild, 'prefix')

    if (!content.startsWith(prefix)) return // If prefix isn't matched, throw out the message
    content = content.substr(prefix.length)

    if (content === 'join') {
        // Join command - joins the VC the user is in, and sets that as the music channel for the server
        // Requires manage server; can't be used in PM
        if (isPrivate) {
            c.createMessage(channel, "You can't do that, I can't play in private calls.")
            return
        }
        if (!memberHasManageGuild(msg.member)) return
        let member = msg.member
        let channelId = member.voiceState ? member.voiceState.channelID : null
        if (!channelId) {
            // fail
            c.createMessage(msg.channel.id, 'Join a voice channel first!')
        } else {
            // oh dang hello
            writeGuildConfig(guild, {vc: channelId})
            joinVoice(c, guild, channelId)
            c.createMessage(channel, '\\o/')
        }
    } else if (content.startsWith('prefix')) {
        // Prefix command - Change's the bot's prefix in the server
        // Requires manage server; can't be used in PM
        if (isPrivate) {
            c.createMessage(channel, "You can't do that, I can't play in private calls.")
            return
        }
        if (!memberHasManageGuild(msg.member)) return
        var newPrefix = content.replace(/prefix ([\s\S]*)/, "$1")
        if (/[a-zA-Z0-9\s\n]/.test(newPrefix)) {
            c.createMessage(channel, "Invalid prefix. Can't be a letter, number, or whitespace character.")
            return
        }
        writeGuildConfig(guild, {prefix: newPrefix})
        c.createMessage(channel, '\\o/')
    } else if (content === 'ignore') {
        // Ignore command - ignores user commands in this channel
        // Requires manage server; can't be used in PM
        if (isPrivate) {
            c.createMessage(channel, "You can't do that, I can't play in private calls.")
            return
        }
        if (!memberHasManageGuild(msg.member)) return
        var denied = getGuildConfig(guild, 'denied')
        if (!denied.includes(channel)) {
            denied.push(channel)
            writeGuildConfig(guild, {denied: denied})
            c.createMessage(channel, "All right, I'll ignore this channel now.")
        } else {
            c.createMessage(channel, "I'm already ignoring this channel.")
            return
        }
    } else if (content === 'unignore') {
        // Unignore command - Stops ignoring user commands in this channel
        // Requires manage server; can't be used in PM
        if (isPrivate) {
            c.createMessage(channel, "You can't do that, I can't play in private calls.")
            return
        }
        if (!memberHasManageGuild(msg.member)) return
        var denied = getGuildConfig(guild, 'denied')
        if (denied.includes(channel)) {
            denied.splice(denied.indexOf(channel), 1)
            writeGuildConfig(guild, {denied: denied})
            c.createMessage(channel, "Got it! I'll stop ignoring this channel.")
        } else {
            c.createMessage(channel, "I wasn't ignoring this channel.")
            return
        }
    } else if (content === 'ignoreall') {
        // Ignore all command - Ignores all text channels in a guild
        // Requires manage server; can't be used in PM
        if (isPrivate) {
            c.createMessage(channel, "You can't do that, I can't play in private calls.")
            return
        }
        if (!memberHasManageGuild(msg.member)) return
        var denied = []
        let guildObj = c.guilds.find(g => g.id === guild)
        let textChannelIds = guildObj.channels.filter(c => c.type == 0).map(c => c.id)
        textChannelIds.forEach(c => denied.push(c))
        writeGuildConfig(guild, {denied: denied})
        c.createMessage(channel, "I'm now ignoring every channel in the server.")
    } else if (content === 'unignoreall') {
        // Unignore all command - stops ignoring all text channels
        // Requires manage server; can't be used in PM
        if (isPrivate) {
            c.createMessage(channel, "You can't do that, I can't play in private calls.")
            return
        }
        if (!memberHasManageGuild(msg.member)) return
        writeGuildConfig(guild, {denied: []})
        c.createMessage(channel, "I'm no longer ignoring any channels here.")
    } else if (content === 'np' || content === 'nowplaying' || content === 'playing') { //lol
        // Now playing - Returns info about the currently playing song
        // Obeys channel ignores
        if (getGuildConfig(guild, 'denied').includes(channel)) return // Do nothing if this channel is ignored
        getSongInfo((err, info) => {
            if (!err) {
                c.createMessage(channel, `**Now playing:** "${info.song_name}" by ${info.artist_name}\n${
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
