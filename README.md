# This repo is unmaintained and outdated!
The bot has since been rewritten, and the current code can be found at [anonymousthing/listen.moe-djs](https://github.com/anonymousthing/listen.moe-djs).

# listen.moe music streaming Discord bot

![status: fabulous](https://img.shields.io/badge/status-fabulous-ff69b4.svg) [![Code Climate](https://img.shields.io/badge/code_climate-fuck_it-red.svg)](https://codeclimate.com/github/Geo1088/listen.moe-streaming-bot)

A bot that streams music from [listen.moe](http://listen.moe) into your Discord channel. [Add it to your server here!](https://discordapp.com/oauth2/authorize?&client_id=222167140004790273&scope=bot)

## Usage

- After you've added the bot to your server, join a voice channel and type `~~join` to bind the bot to that channel. You have to have the "Manage server" permission to use this command.
- At any time, anyone can use the "Now playing" command to see what song is being played and who requested it.
- The bot's "game" will alternate between the server count and the currently playing song every 15 seconds.

## Command list

This list assumes a prefix of `~~`.

- `~~join`  
  Type this while in a voice channel to have the bot join that channel and start playing there. Limited to users with the "manage server" permission.

- `~~nowplaying`, `~~playing`, `~~np`  
  Gets the currently playing song and artist. If the song was requested by someone, also gives their name and a link to their profile on forum.listen.moe.

- `~~help`  
  Shows a real basic usage help which is the same one that appears the first time the bot joins a guild.

- `~~ignore`  
  Ignores commands in the current channel. Admin commands are exempt from the ignore.

- `~~unignore`  
  Unignores commands in the current channel.

- `~~ignoreall`  
  Ignores commands from all channels in the server.

- `~~unignoreall`  
  Unignores commands from all channels in the server.

- `~~prefix <new prefix>`  
  Changes the bot's prefix for this server. Prefixes cannot contain whitespace, letters, or numbers - anything else is fair game. It's recommended that you stick with the default prefix of `~~`, but this command is provided in case you find conflicts with other bots.

## Run it yourself

- Clone the repo
- Create a Discord OAuth application and bot account
- Rename/duplicate `config-sample.json` to `config.json` and fill out the relevant information
- Install dependencies from NPM
- Install FFMPEG - if on Windows, make sure to add it to your PATH
- Run the bot with `node index.js`
