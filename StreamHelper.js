const OpusScript = require("opusscript")
let childProcess = require('child_process')
let VolumeTransformer = require('./VolumeTransformer')

var EventEmitter
try {
    EventEmitter = require("eventemitter3")
} catch(err) {
    EventEmitter = require("events").EventEmitter
}

const MAX_FRAME_SIZE = 1276 * 3
const SILENCE = new Buffer([0xF8, 0xFF, 0xFE])

//Extracted from Eris for single-stream applications
//Credit goes to abalabahaha
class StreamHelper extends EventEmitter {
	constructor(url, ua) {
		super()
		
		this.samplingRate = 48000
        this.channels = 2
        this.frameDuration = 60
        this.frameSize = this.samplingRate * this.frameDuration / 1000
        this.pcmSize = this.frameSize * this.channels * 2
        this.bitrate = 64000
		this.volumeTransformer = new VolumeTransformer()

        try {
            this.opus = new (require("node-opus")).OpusEncoder(this.samplingRate, this.channels, OpusScript.Application.AUDIO)
        } catch(err) {
			console.log("Falling back to opusscript")
            this.opus = new OpusScript(this.samplingRate, this.channels, OpusScript.Application.AUDIO)
            this.opus.setBitrate(this.bitrate)
        }
		
		this.stream = this.loadStream(url, ua)
		
		this.volumeTransformer.attach(this.stream)
		this.stream = this.volumeTransformer

		var killStream = (e) => {
			this.stream.unpipe()
			if(typeof this.stream.destroy === "function") {
				this.stream.destroy()
			}
			if((e instanceof Error)) {
				this.emit("error", e)
			}
		}

		this.volumeTransformer.once("error", killStream)
		this.volumeTransformer.once("unattach", killStream)
		
		this.nonce = new Buffer(24)
        this.nonce.fill(0)

        this.packetBuffer = new Buffer(12 + 16 + MAX_FRAME_SIZE)
        this.packetBuffer.fill(0)
        this.packetBuffer[0] = 0x80
        this.packetBuffer[1] = 0x78
		
		this.playing = false
        this.sequence = 0
        this.timestamp = 0
		
		this.voiceConnections = []
	}
	
	pickCommand() {
		for (let command of ["./ffmpeg", "./avconv", "ffmpeg", "avconv"]) {
			if(!childProcess.spawnSync(command, ["-h"]).error) {
				return command
			}
		}
		throw new Error("Neither ffmpeg nor avconv was found. Make sure you install either one, and check that it is in your PATH")
	}
	
	containsVoiceConnection(vc) {
		for (let i = 0; i < this.voiceConnections.length; i++) {
			let otherVc = this.voiceConnections[i]
			if (otherVc.id == vc.id)
				return true
		}
		return false
	}
	
	addVoiceConnection(vc) {
		console.log("Added vc: " + vc.id)
		this.voiceConnections.push(vc)
	}
	
	loadStream (url, ua) { // Loads a network stream as a PCM stream
		let converterCommand = this.pickCommand()
		
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
	
	setSpeaking(val) {
		for (let i = 0; i < this.voiceConnections.length; i++) {
			this.voiceConnections[i].setSpeaking(val)
		}
	}
	
	playStream(options) {
		this.playing = true
		if(!this.opus) {
            throw new Error("node-opus not found, non-opus playback not supported")
        }

        var onReadable = () => {
			this.playRaw(this.stream, (source) => {
				var buffer = source.read(this.pcmSize)
				if(!buffer) {
					return null
				}

				if (buffer.length !== this.pcmSize) {
					var scratchBuffer = new Buffer(this.pcmSize)
					scratchBuffer.fill(0)
					buffer.copy(scratchBuffer)
					buffer = scratchBuffer
				}

				return this.opus.encode(buffer, this.frameSize)
			}, options)
        }
        if(this.stream.readable) {
            onReadable()
        } else {
            this.stream.once("readable", onReadable)
        }
	}
	
	incrementTimestamps(val) {
		for (let i = 0; i < this.voiceConnections.length; i++) {
			let vc = this.voiceConnections[i]
			vc.timestamp += val
			if(vc.timestamp >= 4294967295) {
				vc.timestamp -= 4294967295
			}
		}
	}
	
	incrementSequences() {
		for (let i = 0; i < this.voiceConnections.length; i++) {
			let vc = this.voiceConnections[i]
			if(++vc.sequence >= 65536) {
				vc.sequence -= 65536
			}
		}
	}
	
	playRaw(source, opusBufferGenerator, options) {
        options = options || {}
		console.log("Started playRaw")

        var startTime = Date.now()
        var packets = 0
        var waitingForData = 0
        var voiceDataTimeout = options.voiceDataTimeout !== undefined ? options.voiceDataTimeout : 2000
        var buffer
        var pausedTime = 0

        var ending = false
        var tellEnd = () => {
			//Should only fire when the stream ends (never) or if something dies
			console.log("He's dead, Jim")
            if(ending) {
                return
            }
            ending = true
            this.setSpeaking(false)

            if(this.volumeTransformer.attached) {
                this.volumeTransformer.unattach()
            } else {
                source.unpipe()
                if(typeof source.destroy === "function") {
                    source.destroy()
                }
            }
			
            this.emit("end")
        }

        var send = () => {
            try {
                if(source.destroyed) {
                    this.setSpeaking(false)
                    tellEnd()
                    return
                }

                this.incrementTimestamps(this.frameSize)
				this.incrementSequences()
                
                buffer = opusBufferGenerator(source)
                if(!buffer && (voiceDataTimeout === -1 || waitingForData <= voiceDataTimeout / this.frameDuration)) { // wait for data
                    if(++waitingForData <= 5) {
                        this.setSpeaking(false)
                        buffer = SILENCE
                    } else {
                        pausedTime += 2 * this.frameDuration
						this.incrementTimestamps(2 * this.frameDuration)
                        return setTimeout(send, 2 * this.frameDuration)
                    }
                } else if (!buffer) {
					// If we still have no buffer data after voiceDataTimeout, just dc
                    for(var i = 1; i <= 5; ++i) {
						this.incrementTimestamps(this.frameSize)
						this.incrementSequences()

						console.log(this.voiceConnections.length)
						for (let vcIndex = 0; vcIndex < this.voiceConnections.length; vcIndex++) {
							let vc = this.voiceConnections[vcIndex]
							vc.sendPacket(vc.createPacket(SILENCE))
						}
                    }
					
                    return tellEnd()
                } else {
                    waitingForData = 0
                    this.setSpeaking(true)
                }

				// Push packet to all VoiceConnections
				for (let vcIndex = this.voiceConnections.length - 1; vcIndex >= 0; vcIndex--) {
					let vc = this.voiceConnections[vcIndex]
					if (!vc.sendPacket(vc.createPacket(buffer))) {
						console.log(":( - Disconnected from " + vc.id)
						this.voiceConnections.splice(vcIndex, 1)
					}
				}
				
				return setTimeout(send, startTime + pausedTime + ++packets * this.frameDuration - Date.now())
            } catch(e) {
                this.emit("error", e)
                tellEnd()
            }
        }

		this.emit("start")
		send()
    }
}

module.exports = StreamHelper