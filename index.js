var fs = require("fs");
var util = require("util");
var mtl = require("mtltojs");
var opts;
var file_path = '';
var file_name = '';
var file_ext = '';
var save_path = '';
var log = [];

function parseFile(file, cbFunc){
	var errMsg = '';
	
	write("Opening File...");
	OpenFile(file, 'r', function(err, fd){
		if(err){
			errMsg = "Error: Opening file " + file + " (" + err + ")";
			write(errMsg);
			cbFunc(errMsg, null);
		}

		write("Getting file stats...")
		fs.fstat(fd, function(err, stats){
			if(err){
				errMsg = "Error: Getting file stats. (" + err + ")";
				write(errMsg);
				cbFunc(errMsg, null);
			}

			write("File Size: " + stats.size);
			var buffer = new Buffer(stats.size);

			write("Reading file...");
			fs.read(fd, buffer, 0, stats.size, 0, function(err, bytesRead, buffer){
				if(err){
					errMsg = "Error: Can not read file: " + err;
					write(errMsg);

					cbFunc(errMsg, null);
				}

				var str = buffer.toString();
				
				parseText(str, function(err, obj){
					write("Closing file...");
					fs.close(fd, function(c_err){
						cbFunc(err, obj);
					})
				});
			});
		});
	});	
}

function parseFileSync(file){
	var errMsg = '';

	write("Opening file...");
	var fd = fs.openSync(file, 'r');
		
	if(fd !== null && fd != undefined){
		write("Getting file stats...");
		var stats = fs.fstatSync(fd);
		
		if(stats !== null && stats != undefined){
			write("File Size: " + stats.size);
			var buffer = new Buffer(stats.size);
			write("Reading file...");
			var bytesRead = fs.readSync(fd, buffer, 0, stats.size, 0);
			var str = buffer.toString();

			write("Closing file...");
			fs.closeSync(fd);

			return parseText(str);
		}
		else{
			errMsg = "Error: Retrieving file stats.";
			write(errMsg);

			fs.closeSync(fd);
		}
	}
	else{
		errMsg = "Error: Opening file, " + file;
		write(errMsg);
	}

	return {err: errMsg, data: data};
}

function parseText(text, cbFunc){
	write("Parse Started...");
	var isAsync = isCallbackFunc(cbFunc);
	var err = null;
	var data = null;
	var num_lines = 0;
	var lines = [];

	if(text && typeof text == "string"){
		var s_time = process.hrtime(); //start counter

		if(text.indexOf('\r\n') > -1){
			lines = text.split('\r\n');
		}
		else if(text.indexOf('\n') > -1){
			lines = text.split('\n');
		}

		num_lines = lines.length;
		
		if(num_lines > 0){
			data = [];
			var line = null;
			var c_type = null; // current type
			var last_line = num_lines - 1;
			var stor_obj = null; // object with line data to be stored in the data array
			var stor_val = null; // object to collect data from line parsing to be stored under the "value" property in stor_obj
			var stor_type = null; // string of the verbose type of the line to be stored under the "type" property in stor_obj

			for(var i = 0; i <= last_line; i++){
				stor_type = '';
				stor_val = null;

				line = lines[i];

				if(line == undefined || line == '' || line == null) continue;

				line = processLine(line);

				c_type = line[0];

				if(c_type) c_type = c_type.toLowerCase();

				stor_obj = {type: '', keyword:c_type, value:null};

				switch(c_type){
					case '#': // Comments
						if(opts.parseComments && line.length > 1 && (line[1] != '' || line[1] != ' ')){
							var c = line.length > 2 ? line.slice(1, line.length).join(' ') : line[1];
							write("Parsing Comment: " + c);
							stor_type = 'comment';
							stor_val = c;
						}
						else{
							continue;
						}
						break;
					case 'mtllib': // Material Library
						write("Parsing Materal lib file reference (mtlib): " + line[1]);
						stor_type = 'material_lib';
						stor_val = line[1];
						break;
					case 'usemtl': // Material name
						write("Parsing Materal name (usemtl): " + line[1]);
						stor_type = "materal name";
						stor_val = line[1];
						break;
					case 'v':  // Geometric vertices
					case 'vt': // Texture vertices
					case 'vn': // Vertex normals
					case 'vp': // Parameter space vertices
						if(c_type == 'v'){
							write("Parsing Geometric vertices (v)...");
							stor_type = 'geometric';
						}
						else if(c_type == 'vt'){
							write("Parsing Texture vertices (vt)...");
							stor_type = 'texture';
						}
						else if(c_type == 'vn'){
							write("Parsing Vertex normals (vn)...");
							stor_type = "normals";
						}
						else if(c_type == 'vp'){
							write("Parsing Parameter space vertices (vp)...");
							stor_type = "parameter space";
						}
						
						var vals = [];
						var continued;

						do{
							continued = false;
							for(var v = 1; v < line.length; v++){
								if(line[v] != null && line[v] != undefined && line[v] != ''){
									vals.push(parseFloat(line[v]));
								}
							}

							if(i != last_line){
								line = processLine(lines[i+1]);
								if(line[0] == c_type){
									continued = true;
									i++;
								}
							}
						}while(continued);

						stor_val = vals;
						break;
					case 'p': //points
						write("Parsing Points (p)...");
						var vals = [];
						var continued;

						do{
							continued = false;
							for(var p = 1; p < line.length; p++){
								if(line[p] == '\\'){
									i++;
									line = processLine(lines[i]);
									p = 0;
								}
								vals.push(parseInt(line[p]));
							}

							if(i != last_line && lines[i+1].indexOf('p') == 0){
								continued = true;
								i++;
								line = processLine(lines[i]);
							}
						}while(continued);
						
						stor_type = 'points';
						stor_val = vals;
						break;
					case 'l': //lines
						write("Parsing line vertex (l)...");
						var val = {vertex: [], texture: hasTxtr ? [] : null};
						var hasTxtr;
						var vals;
						var continued;
						do{
							continued = false;
							hasTxtr = (line[1].indexOf('/') > -1);
							for(var l = 1; l < line.length; l++){
								if(hasTxtr){
									vals = line[l].split('/');
									val['vertex'].push(parseFloat(vals[0]));
									val['texture'].push(parseFloat(vals[1]));
								}
								else{
									val['vertex'].push(parseFloat(line[l]));
								}
							}

							if(i != last_line && lines[i+1].indexOf('l') == 0){
								continued = true;
								i++;
								line = processLine(lines[i]);
							}
						}while(continued);
						
						stor_type = 'line';
						stor_val = val;
						break;
					case 'f': //faces
						write("Parsing Faces (f)...");
						var vals = {};
						var continued;

						do{
							continued = false;
							for(var fData = 1; fData < line.length; fData++){
								var faces = line[fData].indexOf('/') > -1 ? line[fData].split('/') : [line[fData]];
								
								for(var f = 0; f < faces.length; f++){
									var faceData = faces[f];

									if(faceData != null && faceData != undefined && faceData != ''){
										faceData = parseInt(faceData);

										if(f == 0){
											if(!vals['vertex']){vals['vertex'] = [];}
											vals['vertex'].push(faceData);
										}
										else if(f == 1){
											if(!vals['texture']){vals['texture'] = [];}
											vals['texture'].push(faceData);
										}
										else if(f == 2){
											if(!vals['normal']){vals['normal'] = [];}
											vals['normal'].push(faceData);
										}
									}
								}
							}

							if(i != last_line && lines[i + 1].indexOf('f') == 0){
								continued = true;
								i++;
								line = processLine(lines[i]);
							}
						}while(continued);
				
						stor_type = 'face';
						stor_val = vals;
						break;
					case 'o': // Object name
						var n = line.length > 2 ? line.slice(1, line.length).join(' ') : line[1];
						write("Parsing Object (o): " + n);
						stor_type = "object name";
						stor_val = n;
						break;
					case 'g': // Group name
						var n = line.length > 2 ? line.slice(1, line.length).join(' ') : line[1];
						write("Parsing Group name (g): " + n);
						stor_type = "group name";
						stor_val = n;
						break;
					case 'mg': // Merging group
						write("Parsing Merging group (mg)");
						var vals = {
							group_num: parseInt(line[1]),
							resolution: parseFloat(line[2])
						};
						stor_type = 'merging group';
						stor_val = vals;
						break;
					case 's': // Smoothing Group
						write("Parsing Smoothing Group (s): " + line[1]);
						stor_type = "smoothing";
						stor_val = line[1];
						break;
					case 'cstype': // Curve or Surface type
						write("Parsing cstype (" + c_type + ")...");
						var vals = {};
						if(line.length > 2){
							vals['rat'] = line[1];
							vals['type'] = line[2];
						} else{
							vals['type'] = line[1];
						}
						stor_type = 'cstype';
						stor_val = vals;
						break;
					case 'deg': // Degree
					case 'step': // Step
						var type = c_type == "deg" ? "Degrees" : "Step";
						write("Parsing " + type + " (" + c_type + ")...");
						var vals = {};
						vals['u'] = parseInt(line[1]);
						if(line.length > 2){
							vals['v'] = parseInt(line[2]);
						}
						stor_type = type.toLowerCase();
						stor_val = vals;
						break;
					case 'curv': // Curve
						write("Parsing Curve (curv)...");
						var vals = {u:null, v:[]};
						vals['u'] = [parseFloat(line[1]), parseFloat(line[2])]; //[start, end]
						for(var c = 3; c < line.length; c++){
							if(line[c] == '\\' && i != last_line){
								i++;
								line = processLine(lines[i]);
								c = 0;
							}
							vals['v'].push(parseInt(line[c]));
						}
						stor_type = "curve";
						stor_val = vals;
						break;
					case 'curv2': // 2D Curve
						write("Parsing Curve 2D (curv2)...");
						var vals = [];
						for(var c = 1; c < line.length; c++){
							if(line[c] == '\\' && i != last_line){
								i++;
								line = processLine(lines[i]);
								c = 0;
							}

							vals.push(parseInt(line[c]));
						}
						stor_type = 'curve 2d';
						stor_val = vals;
						break;
					case 'parm': // Global Parameters
						write("Parsing Global Parameters (parm)...");
						var vals = {};
						var uv;
						var continued;
						do{
							continued = false;
							uv = line[1]; // line[1] = u || v
							vals[uv] = [];
							for(var p = 2; p < line.length; p++){
								if(line[p] == '\\' && i != last_line){
									i++;
									line = processLine(lines[i]);
									p = 0;
								}
								vals[uv].push(parseFloat(line[p]));
							}

							if(i != last_line && lines[i+1].indexOf('parm') == 0){
								continued = true;
								i++;
								line = processLine(lines[i]);
							}
						}while(continued);
						
						stor_type = "global parameter";
						stor_val = vals;
						break;
					case 'surf': // Surface
						write("Parsing Surface (surf)...");
						var vals = {u:null, v: null, vertices: null};
						vals['u'] = [parseFloat(line[1]), parseFloat(line[2])];
						vals['v'] = [parseFloat(line[3], parseFloat(line[4]))];
						var ver = [];
						var txt = null; // texture vertex
						var nrm = null; // normals
						var verts;
						for(var v = 5; v < line.length; v++){
							if(line[v] == '\\' && i != last_line){
								i++;
								line = processLine(lines[i]);
								v = 0;
							}
							verts = line[v];
							verts = verts.split('/');
							ver.push(parseInt(verts[0]));
							if(verts.length > 1){
								if(txt == null) txt = [];
								txt.push(parseInt(verts[1]));
							}
							if(verts.length > 2){
								if(nrm == null) nrm = [];
								nrm.push(parseFloat(verts[2]));
							}
						}
						vals['vertices'] = {vertex: ver, texture: txt, normals: nrm};
						stor_type = 'surface';
						stor_val = vals;
						break;
					case 'trim': // Trimming loop
					case 'hole': // Trimming loop (hole)
					case 'scrv': // Special Curve
						if(c_type == "scrv"){
							write("Parsing Special Curve");
							stor_type = "special curve";
						}
						else{
							write("Parsing Trimming Loop" + c_type == "hole" ? " (hole)" : "" + "...");
							stor_type = "trimming loop";
						}
						stor_val = [parseFloat(line[1]), parseFloat(line[2]), parseInt(line[3])];
						break;
					case 'end': // end statement for curvs
						write("Parsing End Statement...");
						stor_type = "end";
						break;
					case 'sp': // Special Point
						write("Parsing Special Point (sp)...");
						stor_type = "special point";
						stor_val = [parseInt(line[1]), parseInt(line[2])];
						break;
					case 'bmat': // basis matrix
						var uv;
						var vals = {};
						var continued;
						var s_idx = 2;
						
						do{
							continued = false;
							uv = line[1];
							vals[uv] = [];
							write("Parsing basis matrix (" + c_type + ")...");

							for(var b = s_idx; b < line.length; b++){
								if(line[b] == "\\" && i != last_line){ // if last item is a \ there is more data on the next line
									i++;
									line = processLine(lines[i]);
									b = -1;
								}
								else{
									vals[uv].push(uv == 'u' ? parseInt(line[b]) : parseFloat(line[b]));
								}	
							}
							
							if(i != last_line && lines[i+1].indexOf('bmat') == 0){ // if bmat found it is for the v values
								continued = true;
								s_idx = 2; // [0] = identifier, [1] = u or v, [2] = start of values
								i++;
								line = processLine(lines[i]);
							}
						}while(continued);

						stor_type = "basis matrix";
						stor_val = vals;
						break;
					case 'con': // Connectivity
						write("Parsing Connectivity (con)...");
						stor_type = "connectivity";
						stor_val = [
							parseInt(line[1]),   //Surface 1
							parseFloat(line[2]), // Start of curve (surface 1)
							parseFloat(line[3]), // End of curve (surface 1)
							parseInt(line[4]),   // Index of curve (surface 1)
							parseInt(line[5]),   // Surface 2
							parseFloat(line[6]), // Start of curve (surface 2)
							parseFloat(line[7]), // End of curve (surface 2)
							parseInt(line[8])    // Index of curve (surfect 2)
						];
						break;
					case 'bevel': // Bevel Interpolation
						write("Parsing Bevel (bevel)...");
						stor_type = "bevel";
						stor_val = line[1]; // on or off
						break;
					case 'c_interp': // Color Interpolation
						write('Parseing Color Interpolation (c_interp)...');
						stor_type = "color interpolation";
						stor_val = line[1]; // on or off
						break;
					case 'd_interp': // Dissolve Interpolation
						write("Parsing Dissolve Interpolation (d_interp)...");
						stor_type = "dissolve interpolation";
						stor_val = line[1]; // on or off
						break;
					case 'lod': // Level of Detail
						write("Parsing Level of Detail (lod)...");
						stor_type = "level of detail";
						stor_val = parseInt(line[1]);
						break;
					case 'maplib': // Map Library
						write("Parsing Map Library (maplib)...");
						stor_type = "map library";
						stor_val = line.slice(1, line.length);
						break;
					case 'usemap': // Texture map
						write("Parsing Texture Map (usemap)...");
						stor_type = "texture map";
						stor_val = line[1]; // map name or off
						break;
					case 'shadow_obj': //Shadow obj filename
						write("Parsing Shadow obj filename (shadow_obj)...");
						stor_type = "shadow object filename";
						stor_val = line[1];
						break;
					case 'trace_obj': // Ray Tracing filename
						write("Parsing Ray Tracing Filename (trace_obj)...");
						stor_type = "ray traceing filename";
						stor_val = line[1];
						break;
					case 'ctech': // Curve approx Technique
						write("Parsing Curve Approx Technique (ctech)...");
						var vals = {technique: line[1]};
						if(line.length > 3){
							vals['max_dist'] = parseFloat(line[2]);
							vals['max_angle'] = parseFloat(line[3]);
						}
						else{
							if(line[1] == "cparm"){
								vals['res'] = parseFloat(line[2]);
							} else {
								vals['max_len'] = parseInt(line[2]);
							}
						}
						stor_type = "curve approx technique";
						stor_val = vals;
						break;
					case 'stech': // Surface Technique
						write("Parseing Surface Technique (stech)...");
						var vals = {technique: line[1]};
						switch(line[1]){
							case 'cparma':
								vals['resolution'] =[
									parseFloat(line[2]), // U
									parseFloat(line[3])  // V
								];
								break;
							case 'cparmb':
								vals['resolution'] = parseFloat(line[2]); // uv
								break;
							case 'cspace':
								vals['max_len'] = parseInt(line[2]); // max length
								break;
							case 'curv':
								vals['max_dist'] = parseFloat(line[2]); // max distance
								vals['max_angle'] = parseFloat(line[3]); // max angle
								break;
						}
						stor_type = "surface technique";
						stor_val = vals;
						break;
					case 'bsp': // B-spline patch
						write("Parsing B-Spline Patch (bsp)...");
						var vals = [];
						for(var b = 1; b < line.length; b++){
							if(line[b] == '\\' && i != last_line){
								i++;
								line = processLine(lines[i]);
								b = 0;
							}
							vals.push(parseInt(line[b]));
						}
						stor_type = "b-spline patch";
						stor_val = vals;
						break;
					case 'bzp': // Bezier Patch
						write("Parsing Bezier Patch (bzp)...");
						var vals = [];
						for(var b = 1; b < line.length; b++){
							if(line[b] == '\\' && i != last_line){
								i++;
								line = processLine(lines[i]);
								b = 0;
							}
							vals.push(parseInt(line[b]));
						}
						stor_type = "bezier patch";
						stor_val = vals;
						break;
					case 'cdc': // Cardinal Curve Patch
						write("Parsing Cardinal Curve Patch (cdc)...");
						var vals = [];
						for(var c = 1; c < line.length; c++){
							if(line[c] == '\\' && i != last_line){
								i++;
								line = processLine(lines[i]);
								c = 0;
							}
							vals.push(parseInt(line[c]));
						}
						stor_type = "cardinal curve patch";
						stor_val = vals;
						break;
					case 'cdp': // Cardinal Patch
						write("Parsing Cardinal Patch (cdp)...");
						var vals = [];
						for(var c = 1; c < line.length; c++){
							if(line[c] == '\\' && i != last_line){
								i++;
								line = processLine(lines[i]);
								c = 0;
							}
							vals.push(parseInt(line[c]));
						}
						stor_type = "cardinal patch";
						stor_val = vals;
						break;
					case 'res': // Reference
						write('Parsing Reference (res)...');
						stor_type = "reference";
						stor_val = {
							useg: parseInt(line[1]),
							vseg: parseInt(line[2])
						}
						break;
					default:
						if(c_type.indexOf('#') == 0){ // possible comment without a space after the '#'
							if(opts.parseComments){
								line[0] = line[0].replace('#', '');
								var c = line.join(' ');
								write("Parsing Comment: " + c);
								stor_obj['keyword'] = '#';
								stor_type = "comment";
								stor_val = c;
							}
						}
						else{
							write("!!! Unprocessed Line @ " + i + ": " + lines[i]);
							stor_type = 'unprocessed';
						}
				} // end switch

				stor_obj['type'] = stor_type;
				stor_obj['value'] = stor_val;
				data.push(stor_obj); //push next line object from file to the data array... values for stor_obj are set in switch statement.
			} // end for loop
		}
		else{
			err = "Error: Can not split file data into lines.";
			write(err);
		}

		write("Parse Completed...");
		var d_time = process.hrtime(s_time);
		write("Parse time: " + d_time[0] + "s, " + d_time[1] + "ns");
		write("Number of Lines: " + num_lines);
	}
	else{
		err = "Error: No string passed to be parsed.";
		write(err);
	}

	if(isAsync){
		cbFunc(err, data);
	} else{
		return {err: err, data: data};
	}
}

function processLine(str){
	str = str.replace(/\s\s+/g, ' ');
	str = str.trim();
	return str.split(' ');
}

function OpenFile(file, option, cbFunc){
	if(isCallbackFunc(cbFunc)){
		if(!file) cbFunc("No file", null);
		fs.open(file, option, cbFunc);
	}
	else{
		if(!file) return false;
		return fs.openSync(file, option);
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
	}
}

function getDefaultOptions(){
	return  {
		parseComments: false,
		verbose: false,
		logging: false,
		returnJSON: false,
		saveJSON: false,
		parseMTLFile: false,
		returnMTLJSON: false,
		saveMTLJSON: false
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
		if(options.parseMTLFile == true){
			opts.parseMTLFile = true;

			if(options.returnMTLJSON == true){
				opts.returnMTLJSON = true;
			}
			if(options.saveMTLJSON == true){
				opts.saveMTLJSON = true;
			}
		}
	}

	writeToConsole("Setting options...");
}

function writeLoggingHeader(){
	writeToLog("ObjToJs - .obj to JS Parser.");
	writeToLog("Log file from parsing file: " + file_path + file_name + '.' + file_ext);
	writeToLog("Options: " + JSON.stringify(opts));
	writeToLog(" ");
	writeToLog("===============================================================================================================================");
	writeToLog(" ");
}

function write(msg){
	writeToConsole(msg);
	writeToLog(msg);
}

function writeToLog(msg){
	if(opts.logging && msg){
		log.push(msg);
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

function getObjFileAndPath(){
	return getPathAndFile('obj');
}
function getJsonFileAndPath(){
	return getPathAndFile('json');
}
function getLogFileAndPath(){
	return getPathAndFile('log');
}
function getPathAndFile(ext){
	switch(ext){
		case 'obj':
		case 'json':
		case 'log': return file_path + file_name + '.' + ext;
		default: return '';
	}
}

function createFolder(cbFunc){
	var isAsync = isCallbackFunc(cbFunc);
	
	if(opts.saveJSON || opts.logging){
		write("Creating folder to save log and/or JSON files...");
		var path = file_path + file_name + '/';
		write("Checking if path '" + path + "' exists...");
		if(isAsync){
			fs.exists(path, function(exists){
				if(!exists){
					write("Creating folder '" + path + "'...");
					fs.mkdir(path, function(e){
						if(e){
							write("Error: Can not create folder " + path + " | " + e);
							write("Files will be saved to '" + file_path + "'...");
							save_path = file_path;
							cbFunc(e);
						}
						
						write("Folder created: " + path);
						save_path = path;
						cbFunc(0);
					});
				}
				else{
					write("Folder already exists, no need to create it...");
					save_path = path;
					cbFunc(0);
				}
			});
		}
		else{
			if(!fs.existsSync(path)){
				var e = fs.mkdirSync(path);

				if(e){
					write("Error: Can not create folder " + path + " | " + e);
					write("Files will be saved to " + file_path);
							save_path = file_path;
					return e;
				}
				else{
					write("Folder created: " + path);
					save_path = path;
					return 0;
				}
			}
			else{
				write("Folder already exists, no need to create it...");
				save_path = path;
				return 0;
			}
		}
	}
	else{
		if(isAsync){cbFunc(0);}
		else{return 0;}
	}
}

function processJSON(data, cbFunc){
	var isAsync = isCallbackFunc(cbFunc);
	var err = 0;

	if(opts.saveJSON || opts.returnJSON){
		if(data == null){
			err = "ERROR: Can not create JSON...  Data is null!";
			write(err);
			if(isAsync){cbFunc(err, null);}
			else{return null;}
		}
		else{
			writeToConsole("Creating JSON from data...");
			var json = JSON.stringify(data);

			if(opts.saveJSON){
				var jsonFile = save_path + file_name + ".json";
				writeToConsole("Saving JSON file...");

				if(isAsync){
					fs.writeFile(jsonFile, json, function(wErr){
						if(wErr){
							err = "Error: Saving JSON file: " + wErr;
							write(err);
							cbFunc(err, opts.returnJSON ? json : null);
						}
						else{
							write("JSON saved to file " + jsonFile);
							cbFunc(err, opts.returnJSON ? json : null);
						}
					});
				}
				else{
					try{
						fs.writeFileSync(jsonFile, json);
						write("JSON saved to file " + jsonFile);
					}
					catch(e){
						write("Error: Can not save JSON file: " + e);
					}

					return opts.returnJSON ? json : null;
				}
			}
			else{
				if(isAsync){cbFunc(0, json);}
				else{return json;}
			}
		}
	}
	else{
		if(isAsync){cbFunc(0, null);}
		else{return null;}
	}
}

function saveLog(cbFunc){
	var isAsync = isCallbackFunc(cbFunc);
	var err = 0;

	if(opts.logging){
		writeToConsole("Saving Log file...");
		var logFile = save_path + file_name + ".log";

		if(log != null && log.length > 0){
			var logData = log.join('\r\n');

			if(isAsync){
				fs.writeFile(logFile, logData, function(wErr){
					if(wErr){
						err = "Error: Can not save log file: " + wErr;
						writeToConsole(err);
					}
					else{
						writeToConsole("Log file saved: " + logFile);
					}

					cbFunc(err);
				});
			}
			else{
				try{
					fs.writeFileSync(logFile, logData);
					writeToConsole("Log file saved: " + logFile);
				}
				catch(e){
					err = "Error: Can not save log file: " + e;
					writeToConsole(err);
				}

				return err;
			}
		}
		else{
			err = "Error: No log data recorded to save.";

			if(isAsync){cbFunc(err);}
			else{return err;}
		}
	}
	else{
		if(isAsync){cbFunc(err);}
		else{return err;}
	}
}

function parseMTLFile(data, cbFunc){
	var isAsync = isCallbackFunc(cbFunc);
	var rObj = {err:'', data: null}; //return object
	if(opts.parseMTLFile == true){
		var file = data.material_lib;
		write("Starting of parsing of Material file '" + file + "'...");
		if(file){
			file = file_path + file;
			write("Parsing material file: " + file);
			var mOpts = {
				parseComments: opts.parseComments,
				verbose: opts.verbose,
				logging: opts.logging,
				returnJSON: opts.returnMTLJSON,
				saveJSON: opts.saveMTLJSON
			};

			if(isAsync){
				mtl.parse(file, mOpts, function(err, data){
					if(err){
						write("Error: There was an error when parsing the material file; please see the log file under material folder for more details...");	
					}else{
						write("Parse of material file complete...");
					}

					cbFunc(err, data);
				});
			}
			else{
				var mData = mtl.parseSync(mtlFile, mOpts);

				if(!mData || mData.err){
					write("Error: There was an error when parsing the material file; please see the log file under material folder for more details...");
				}else{
					write("Parse of material file complete...");
				}

				return mData;
			}
		}
		else{
			write("Error: No material file reference was parsed in this object file.");
			rObj.err = "No file reference was found in object file.";
			if(isAsync){cbFunc(rObj.err, null);}
			else{return rObj;}
		}			
	}
	else{
		rObj.err = -1; // option not set
		if(isAsync){cbFunc(-1, null);}
		else{return rObj;}
	}
}

function parse(file, options, cbFunc){
	var ov_s_time = process.hrtime();
	var s_mem = process.memoryUsage();

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

	validateFile(file, function(err){
		if(err){
			write(err);
			cbFunc(err, null);
		}
		else{
			writeLoggingHeader();

			parseFile(file, function(err, parsedObj){
				var rObj = {err: err, data: parsedObj};
				createFolder(function(err){
					processJSON(parsedObj, function(err, json){
						if(!err && json != null){
							rObj.JSON = json;
						}

						write("Memory usage before parse: " + util.inspect(s_mem, {depth:null}));
						var u_mem = process.memoryUsage();
						write("Memory usage after parse: " + util.inspect(u_mem, {depth: null}));
						write("Total memory used: " + (u_mem.heapUsed - s_mem.heapUsed))

						var ov_e_time = process.hrtime(ov_s_time);
						write("Overall Run Time: " + ov_e_time[0] + "s, " + ov_e_time[1] + "ns");

						parseMTLFile(parsedObj, function(err, mObj){
							if(err != -1){
								rObj.material = mObj;
							}

							saveLog(function(err){
								cbFunc(err, rObj);
							});
						});
					});
				});
			})
		}
	});
}

function parseSync(file, options){
	var ov_s_time = process.hrtime();
	var s_mem = process.memoryUsage();
	
	setOptions(options);

	var err = validateFile(file);
	
	if(err){
		write(err);
		return {err: err, data:null};
	}

	writeLoggingHeader();

	var parsedObj = parseFileSync(file);

	createFolder();

	var json = processJSON(parsedObj.data);

	write("Memory usage before parse: " + util.inspect(s_mem, {depth:null}));
	var u_mem = process.memoryUsage();
	write("Memory usage after parse: " + util.inspect(u_mem, {depth: null}));
	write("Total memory used: " + (u_mem.heapUsed - s_mem.heapUsed))

	var ov_e_time = process.hrtime(ov_s_time);
	write("Overall Run Time: " + ov_e_time[0] + "s, " + ov_e_time[1] + "ns");

	var rData = {err: err, data: parsedObj};
	if(json) rData.json = json;

	var mData = parseMTLFile(parsedObj);

	if(mData && mData.err != -1){
		rData.material = mData;
	}

	saveLog();

	return rData;
}

exports.parse = parse;
exports.parseSync = parseSync;