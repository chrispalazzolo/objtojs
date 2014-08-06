var fs = require("fs");

var nl1 = 0x0D;
var nl2 = 0x0A;
var comment = 0x23;

function openFile(file, cb){
	if(file && file.indexOf(".obj") > -1){
		fs.open(file, 'r', function(err, fd){
			if(!err){
				fs.fstat(fd, function(err, fstats){
					if(!err){
						cb(false, fd, fstats);
					}
					else{
						fs.close(fd, function(err){
							cb("Error getting file data", null, null);
						}); // make sure to close the file
					}
				});
			}
			else{
				cb(err, null, null);
			}
		});
	}
	else{
		cb("No file or file not valid", null, null);
	}
}

function closeFile(fd, cb){
	if(fd){
		fs.close(fd, function(err){
			cb(err);
		});
	}
	else{
		cb("no file data passed");
	}
}

function readByte(fd, pos, cb){
	if(fd){
		var buff = new Buffer(1);
		fs.read(fd, buff, 0, 1, pos, function(err, rbytes, buff){
			cb(err, buff, pos + 1);
		});
	}
	else{
		cb("Error: Can't read a byte, no file data found.", null, pos);
	}
}

function readBytes(fd, pos, nbtyes, cb){
	if(fd){
		var buff = new Buffer(nbytes);
		fs.read(fd, buff, 0, nbytes, pos, function(err, rbytes, buff){
			cb(err, buff, pos + nbytes);
		});
	}
	else{
		cb("Error: Can't read a byte, no file data found.", null, pos);
	}
}

// reads in a buffer until it reaches a new line. passes in err, buffer, and the new file position in the callback function
function readLine(fd, sp, cb){
	if(fd){
		var cp = sp; // current position = start position
		var line_read = false;
		var line_buff = new Buffer(1);
		var nl1_found = false;
		var nl2_found = false;

		var fuse = 100; // Temp fuse to make sure that I don't get caught in a loop

		while(!line_read){
			readByte(fd, cp, function(err, buff, np){
				if(!err){
					if(buff){
						line_buff = Buffer.concat(line_buff, buff);
						cp = np;
						cbyte = buff.readUInt8(0);
						if(cbyte == nl1){
							nl1_found = true;
						}
						else if(cbyte == nl2){
							nl2_found = true;
						}

						if(nl1_found && nl2_found){
							line_read = true;
						}
					}
					else{
						cb("Error: Reading line from file, no buffer returned.", null, sp);
					}
				}
				else{
					cb(err, null, sp);
				}
			});

			// TEMP CODE TO MAKE SURE THAT I DON'T GET CAUGHT IN A INFIN LOOP
			fuse--;

			if(fuse <= 0){
				console.log("Fuse Popped!!!")
				line_read = true;
			}
			//////////////////////////////////////////////////////////////////
		}

		cb(false, line_buff, cp);
	}
	else{
		cb("Error: Can't read line, no file data found", null, sp);
	}
}

function startParsing(fd, fstats, cb){
	if(fd && fstats){
		var fsize = fstats.size;
		var fp = 0; // position in file

		readLine(fd, fp, function(err, buff, new_pos){
			fp = new_pos;
			console.log("New Pos: " + new_pos)
			console.log(buff.toString());
			process.exit(0);
		});
	}
	else{
		cb("Error: Can't start parsing, no file data found.", null);
	}
}

function parseFile(file, options, cb){
	openFile(file, function(err, fileD, fileStats){
		if(!err){
			startParsing(fileD, fileStats, function(err, obj){
				var parseError = err;
				closeFile(fileD, function(err){
					cb(parseError, obj);
				});
			});
		}
		else{
			//if error no need to close file
			cb(err, null);
		}
	});
}

function parse(file, options, cb){
	parseFile(file, options, function(err, obj){
		cb(err, obj);
	});
}

function parseToJson(file, options, cb){
	parseFile(file, options, function(err, obj){
		if(!err){
			cb(false, JSON.stringify(obj));
		}
		else{
			cb(err, '');
		}
	});
}

exports.parse = parse;
exports.parseToJson = parseToJson;