let Eris = require('eris')
let fs = require('fs')
let request = require('request')
let merge = require('merge')
let reload = require('require-reload')(require)

let config = require('./config.json')

let guilds
try {
    guilds = reload('./guilds.json')
} catch (e) {
    console.log("BAD THING HAPPENED AND GUILDS.JSON DOESNT EXIST AAAAAAAA")
    guilds = {}
}

let c = new Eris.Client(config.token)
let sharedStream = c.createSharedStream(config.stream, config.ua)

function joinVoice (client, guild, channel) { // Join a voice channel and start playing the stream there
    let cc = client.voiceConnections.find(vc => vc.id === guild) // Find a current connection in this guild
    if (cc) { // If there is one
        // Just switch the channel for this connection
        cc.switchChannel(channel)
        // Config thing
        writeGuildConfig(guild, {vc: channel})
    } else { // Looks like we'll need to make a new one
        // Create a new voice connection and join the channel
        sharedStream.joinVoiceChannel(channel).then(vc => {
            if (vc) {
                let realGuild = c.guilds.get(guild);
                console.log(`Added voice connection for guild ${realGuild.name} (${realGuild.id})`)
            }
        }, error => {
            console.log(error)
        })
    }

    // wew that was a lot of comments
}

function writeGuildConfig (guild, object) { // Change a guild's config via an object of options, and save the changes
    var currentConfig = guilds[guild] || {} // Get gurrent config for this guild, creating it if it doesn't exist
    var newConfig = merge(currentConfig, object) // Merge new options with current
    var _guilds = guilds
    _guilds[guild] = newConfig // Write this new config back to the config
    if (!fs.existsSync('./backups'))
        fs.mkdirSync('./backups')
    fs.writeFile(`backups/guilds-${Date.now()}.json`, JSON.stringify(guilds)) // Create a backup before doing anything
    fs.writeFile('guilds.json', JSON.stringify(_guilds), 'utf-8', err => { // Store the new stuff in the file
        if (err) console.log(err)
        else guilds = reload('./guilds.json') // Reload the file
    })
}

function getGuildConfig (guild, option) { // Get a config option from a guild
    let defaults = config.guildDefaults // Grab the defaults, just in case
    if (!guilds[guild] || !guilds[guild][option]) return defaults[option] // logic whee
    return guilds[guild][option]
}

function getSongInfo (callback) { // Get the stream's info for the current song
    request(config.streamInfo, {headers: {'User-Agent': config.ua}}, (err, res, body) => {
        try { body = JSON.parse(body) } catch (e) { err = e }
        // \o/
        if (!err) return callback(null, body)
        // shit
        return callback(err)
    })
}

function memberHasManageGuild (member) { // Return whether or not the user can manage the server (this is the basis for command permissions)
    return member.permission.json.manageGuild
}

c.once('ready', () => {
    let errorHandler = (e) => {
        console.log("SharedStream died!")
        if (e) {
            if (typeof e === 'string')
                console.log(e)
            else
                console.log(JSON.stringify(e))
        }
        process.exit(1) // Kill ourself if the stream died, so our process monitor can restart us
        // hey anon suicide is bad okay
    }
    sharedStream.on("error", errorHandler)
    sharedStream.on("end", errorHandler)
    sharedStream.on("disconnect", (vc) => {
        console.log(":( - Disconnected from " + vc.id);
    });

    console.log(`Connected as ${c.user.username} / Currently in ${c.guilds.size} servers`)

    // This code has no practical value, but it's fun so w/e
    var useSongName = true
    function updateGame () {
        if (useSongName) {
            getSongInfo((err, body) => {
                if (!err) {
                    c.editStatus("online", {name: `${body.artist_name} ${config.separator || '-'} ${body.song_name}`})
                } else {
                    c.editStatus("online", {name: 'music probably'});
                    console.log("Getting song info didn't work\n"+err)
                }
            })
            useSongName = false // next update will not use this
        } else {
            c.editStatus("online", {name: `on ${ c.guilds.size } servers`})
            useSongName = true // next update will use other thing
        }
    }
    updateGame()
    setInterval(updateGame, config.gameInterval)

    // end useless code - begin code that does useful things
    // (I could get into an argument about relative usefulness here but I'll leave that for another unnecessary comment)
    for (let guild of Object.keys(guilds)) { // loop through all the servers recorded
        let channel = getGuildConfig(guild, 'vc') // Get the channel for this guild
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
                c.createMessage(channel, `**Now playing:** "${info.song_name}" by ${info.artist_name}${
                    info.request ? `\n**Requested by:** ${info.requested_by} (<https://forum.listen.moe/u/${info.requested_by}>)` : ''
                    //3deep5me
                    // seriously though there's gotta be a better way to do this shit
                }${
                    info.anime_name ? `\n**Anime:** ${info.anime_name}` : ''
                    // yes
                }`)
            }
        })
    } else if (content.startsWith('eval')) {
        if (!config.owners.includes(msg.author.id)) return c.createMessage(msg.channel.id, 'soz bae must be bot owner') // todo: stop using unnecessary todo lines that make lines way too long
        let toEval = content.replace(/eval ([\s\S]*)/, "$1")
        let thing
        try {
            thing = eval(toEval) // eval is harmful my ass
        } catch (e) {
            thing = e
        }
        c.createMessage(msg.channel.id, thing)
    } else if (content === 'servers') {
        if (!config.owners.includes(msg.author.id)) return c.createMessage(msg.channel.id, 'soz bae must be bot owner') // jkfhasdkjhfkajshdkfsf
        c.createMessage(msg.channel.id, c.guilds.map(g=>`\`${g.id}\` ${g.name}`).join('\n'))
    }
})

c.connect()

/*

TODO's
- Find more things to do

*/
