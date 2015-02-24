var fs = require("fs");
var util = require("util");
var opts;
var file_path = '';
var file_name = '';
var file_ext = '';
var s_time = 0;
var d_time = 0;
var s_mem = 0;
var u_mem = 0;
var bWritten = 0;
var loggingFd = null;

function AsyncParse(file, cbFunc){
	var errMsg = '';
	
	initParse();

	OpenFile(file, 'r', function(err, fd){
		if(err){
			errMsg = "Error: Opening file " + file + " (" + err + ")";
			writeToConsole(errMsg);
			cbFunc(errMsg, null);
		}

		fs.fstat(fd, function(err, stats){
			if(err){
				errMsg = "Error: Getting file stats. (" + err + ")";
				writeToConsole(errMsg);
				cbFunc(errMsg, null);
			}

			writeToConsole("File size: " + stats.size);

			s_time = process.hrtime(); //start counter

			var buffer = new Buffer(stats.size);

			fs.read(fd, buffer, 0, stats.size, 0, function(err, bytesRead, buffer){
				if(err){
					errMsg = "Error: read";
					process.exit(1);
				}

				var str = buffer.toString();
				
				ParseText(str, function(err, obj){
					fs.close(fd, function(c_err){
						d_time = process.hrtime(s_time);
						writeToConsole(d_time);
						u_mem = process.memoryUsage();
						writeToConsole("End mem: " + util.inspect(u_mem, {depth: null}));
						writeToConsole("Used mem: " + (u_mem.heapUsed - s_mem.heapUsed))
						cbFunc(err, obj);
					})
				});
			});
		});
	});	
}

function OpenFile(file, option, cbFunc){
	if(isCallbackFunc(cbFunc)){
		if(!file) cbFunc("No file", null);
		fs.open(file, option, cbFunc);
	}
	else{
		if(!file) return false;
		return fs.open(file, option);
	}
}

function SyncParse(file){
	var errMsg = '';
	
	initParse();

	var fd = fs.openSync(file, 'r');
		
	if(fd !== null && fd != undefined){
		var stats = fs.fstatSync(fd);
		
		if(stats !== null && stats != undefined){
			var buffer = new Buffer(stats.size);
			var bytesRead = fs.readSync(fd, buffer, 0, stats.size, 0);
			var str = buffer.toString();

			fs.closeSync(fd);

			return ParseText(str);
		}
		else{
			errMsg = "Error: Retrieving file stats.";
			fs.closeSync(fd);
		}
	}
	else{
		errMsg = "Error: Opening file, " + file;
	}

	return {err: errMsg, data: data};
}

function initParse(){
	s_mem = process.memoryUsage();
	writeToConsole("start mem: " + util.inspect(s_mem, {depth:null}));
}

function ParseText(text, cbFunc){
	var isAsync = isCallbackFunc(cbFunc);
	var err = null;
	var data = null;
	var num_lines = 0;
	var unproc_lines = [];

	if(text && typeof text == "string"){
		var lines = text.split('\r\n');
		num_lines = lines.length;

		writeToConsole("Number of Lines: " + num_lines);
		
		if(num_lines > 0){
			data = {};
			var obj = null;
			var line = null;
			var c_type = null; // current type
			var p_type = '';   // previous type
			var isHeader = true;
			var last_line = num_lines - 1;

			for(var i = 0; i <= last_line; i++){
				line = lines[i];

				if(line == undefined || line == '' || line == null){
					if(i == last_line && obj != null){
						if(!data.objs){ data.objs = []; }
						data.objs.push(obj);
					}

					continue;
				}

				if(line.charAt(0) == "#"){
					if(isHeader){
						if(!data.comments){
							data.comments = [];
						}

						data.comments.push(line);
					}
					else{
						if(obj == null){obj = {};}
						if(!obj.comments){
							obj.comments = [];
						}

						obj.comments.push(line);
					}

					continue;
				}

				//line = line.replace(/  /g, ' ');
				line = line.split(' ');

				p_type = c_type;
				c_type = line[0];
				
				if(c_type != p_type && p_type == 'f' && obj != null){
					if(!data.objs){ data.objs = []; }

					data.objs.push(obj);
					obj = null;
				}

				switch(c_type){
					case 'mtllib':
						data.material_lib = line[1];
						isHeader = false;
						break;
					case 'usemtl':
						obj.use_material = line[1];
						break;
					case 'v':
					case 'vt':
					case 'vn':
					case 'vp':
						if(obj == null){obj = {};}
						if(!obj[c_type]){
							obj[c_type] = [];
						}

						for(var v = 1; v < line.length; v++){
							if(line[v] != null && line[v] != undefined && line[v] != ''){
								obj[c_type].push(parseFloat(line[v]));
							}
						}
						break;
					case 'o':
						if(obj == null){obj = {};}
						obj.name = line[1];
						break;
					case 'g':
						if(obj == null){obj = {};}
						obj.group_name = line[1];
						break;
					case 's':
						obj.smoothing = line[1];
						break;
					case 'f':
						if(obj == null){obj = {};}
						if(!obj.faces){obj.faces = {};}
						
						for(var fData = 1; fData < line.length; fData++){
							var faces = line[fData].indexOf('/') > -1 ? line[fData].split('/') : [line[fData]];
							
							for(var f = 0; f < faces.length; f++){
								var faceData = faces[f];

								if(faceData != null && faceData != undefined && faceData != ''){
									faceData = parseInt(faceData);

									if(f == 0){
										if(!obj.faces.vertex){obj.faces.vertex = [];}
										obj.faces.vertex.push(faceData);
									}
									else if(f == 1){
										if(!obj.faces.texture){obj.faces.texture = [];}
										obj.faces.texture.push(faceData);
									}
									else if(f == 2){
										if(!obj.faces.normal){obj.faces.normal = [];}
										obj.faces.normal.push(faceData);
									}
								}
							}
						}
						break;
					default:
						unproc_lines.push(lines[i]);
						writeToConsole("Unprocessed Line: (#" + i + ") " + lines[i]);
				}
			}
		}
		else{
			err = "Error: Can not split file data into lines.";
		}
	}
	else{
		err = "Error: No string passed to be parsed.";
	}

	if(isAsync){
		cbFunc(err, data);
	} else{
		return {err: err, data: data};
	}
}

function parseLine(line, obj, cbFunc){
	var isAsync = isCallbackFunc(cbFunc);

	//Do parsing here
	
	if(isAsync){
		cbFunc(err, obj);
	} else{
		return obj;
	}
}

function validateFile(file, cbFunc){
	var isAsync = isCallbackFunc(cbFunc);
	var err = false;

	if(!file || typeof file != "string"){
		err = "Error: No file provided or path not string.";

		if(isAsync){ cbFunc(err); }
		else{ return err; }
	}

	if(file.indexOf('.obj') < 1){ // a .obj is a vaild file name
		err = 'Error: Not a vaild OBJ file: ' + file;
		
		if(isAsync){ cbFunc(err); }
		else{ return err; }
	}

	err = "Error: File doesn't exist: " + file;

	if(isAsync){
		fs.exists(file, function(exist){
			if(exist){
				err = false;
				parseFilePath(file);
			}

			cbFunc(err);
		});
	}
	else{
		if(fs.existsSync(file)){
			err = false;
			parseFilePath(file);
		}

		return err;
	}
}

function parseFilePath(file, cbFunc){
	var isAsync = isCallbackFunc(cbFunc);
	var err = false;

	if(!file || typeof file != "string"){
		err = "Error: No file path givin.";
		if(isAsync){cbFunc(err);}
		else{return err;}
	}
	else{
		if(file.indexOf('/') == -1 || file.indexOf('.') == -1){
			err = "Error: Not a valid file path or file.";
			if(isAsync){cbFunc(err);}
			else{return err;}
		}
		var f = file.split('/');
		var fn = f[f.length-1].split('.');
		file_name = fn[0];
		file_ext = fn[1];
		file_path = f.slice(0, f.length - 1).join('/') + '/';
		// writeToConsole("file_name: " + file_name);
		// writeToConsole("file_ext: " + file_ext);
		// writeToConsole("file_path: " + file_path);
	}
}

function getDefaultOptions(){
	return  {
		parseComments: false,
		verbose: false,
		logging: false,
		returnJSON: false,
		saveJSON: false
	};
}

function setOptions(options){
	opts = getDefaultOptions();
	
	if(options && typeof options == "object"){
		if(options.parseComments == true){
			opts.parseComments = true;
		}
		if(options.verbose == true){
			opts.verbose = true;
		}
		if(options.logging == true){
			opts.logging = true;
		}
		if(options.returnJSON == true){
			opts.returnJSON = true;
		}
		if(options.saveJSON == true){
			opts.saveJSON = true;
		}
	}

	writeToConsole("Setting options...");
}

function write(msg, cbFunc){
	writeToConsole(msg);
	writeToLog(msg, cbFunc);
}

function writeToLog(msg, cbFunc){
	if(opts.logging && loggingFd != null && msg){
		var buffer = new Buffer(msg + '\r\n');
		if(isCallbackFunc(cbFunc)){
			fs.write(loggingFd, buffer, 0, buffer.length, bWritten, cbFunc);
		}
		else{
			bWritten += fs.writeSync(loggingFd, buffer, 0, buffer.length, bWritten);
		}
	}
}

function writeToConsole(txt, override){
	if((opts.verbose || override) && txt){
		console.log(txt);
	}
}

function isCallbackFunc(cbFunc){
	return cbFunc && typeof cbFunc == "function";
}

function getObjFilePath(){
	return getPath('obj');
}
function getJsonFilePath(){
	return getPath('json');
}
function getLogFilePath(){
	return getPath('log');
}

function getPath(ext){
	switch(ext){
		case 'obj':
		case 'json':
		case 'log': return file_path + file_name + '.' + ext;
		default: return '';
	}
}

function parse(file, options, cbFunc){
	var ov_s_time = process.hrtime();
	if(arguments.length == 0){
		writeToConsole("Error: No arguments found.", true);
		process.exit(1);
	}
	
	if((arguments.length == 2 && typeof options != "function")||(arguments.length == 3 && typeof cbFunc != "function")){
		writeToConsole("Error: No callback function provided.", true);
		process.exit(1);
	}

	if(arguments.length == 2){
		cbFunc = options;
		options = {};
	}

	setOptions(options);
	writeToConsole("Start Parse (Async)...");

	validateFile(file, function(err){
		if(err){
			writeToConsole(err);
			cbFunc(err, null);
		}
		else{
			if(opts.logging){
				var logFile = getLogFilePath();
				OpenFile(logFile, 'w', function(err, fd){
					if(err){
						writeToConsole("Error: Failed to open file for logging: " + logFile);
						writeToConsole(err);
						writeToConsole("Proceeding with file parsing...");
					}

					loggingFd = fd;

					AsyncParse(file, function(err, data){
						writeToConsole("Parse complete.");
						var ov_e_time = process.hrtime(ov_s_time);
						writeToConsole("Overall Run Time: " + ov_e_time[0] + "s, " + ov_e_time[1] + "ns");

						cbFunc(err, data);
					});
				});
			}
			else{
				AsyncParse(file, function(err, data){
					writeToConsole("Parse complete.");
					var ov_e_time = process.hrtime(ov_s_time);
					writeToConsole("Overall Run Time: " + ov_e_time[0] + "s, " + ov_e_time[1] + "ns");

					cbFunc(err, data);
				});
			}
		}
	});
}

function parseSync(file, options){
	var ov_s_time = process.hrtime();
	setOptions(options);
	writeToConsole("Start Parse (Sync)...");

	var err = validateFile(file);
	if(err){
		writeToConsole(err);
		return {err: err, data:null};
	}
	
	if(opts.logging){
		var logFile = getLogFilePath();
		loggingFd = OpenFile(logFile, 'r');
		writeToConsole(loggingFd);
	}

	var data = SyncParse(file);

	writeToConsole("Parse complete...");

	if(opts.saveJSON || opts.returnJSON){
		var json = JSON.stringify(data);
		
		if(opts.saveJSON){
			var jsonFile = getJsonFilePath();
			writeToConsole("Saving JSON to file: " + jsonFile);
			fs.writeFileSync(jsonFile, json);
			writeToConsole("Save JSON Complete...");
		}
	}

	var ov_e_time = process.hrtime(ov_s_time);
	writeToConsole("Overall Run Time: " + ov_e_time[0] + "s, " + ov_e_time[1] + "ns");

	var rData = {err: err, data: data};
	if(json) rData.json = json;

	return rData;
}

exports.parse = parse;
exports.parseSync = parseSync;