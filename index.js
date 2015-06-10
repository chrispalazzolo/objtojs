var fs = require("fs");
var util = require("util");
var opts;
var file_path = '';
var file_name = '';
var file_ext = '';
var log = [];

function parseFileAsync(file, cbFunc){
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
						if(!data.objects){ data.objects = []; }
						data.objects.push(obj);
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

				line = line.split(' ');

				p_type = c_type;
				c_type = line[0];
				if(c_type) c_type = c_type.toLowerCase();
				
				if(c_type != p_type && (p_type == 'f' || p_type == 'l' || p_type == 'p' || p_type == 'end') && obj != null){
					if(!data.objects){ data.objects = []; }

					data.objects.push(obj);
					obj = null;
				}

				switch(c_type){
					case 'mtllib': // Material Library
						write("Parsing Materal lib file reference (mtlib): " + line[1]);
						data.material_lib = line[1];
						isHeader = false;
						break;
					case 'usemtl': // Material name
						write("Parsing Materal name (usemtl): " + line[1]);
						obj.use_material = line[1];
						break;
					case 'v':  // Geometric vertices
					case 'vt': // Texture vertices
					case 'vn': // Vertex normals
					case 'vp': // Parameter space vertices
						var which_v = null;
						if(c_type == 'v'){
							if(p_type != 'v') write("Parsing Geometric vertices (v)...");
							which_v = 'geometric';
						}
						else if(c_type == 'vt'){
							if(p_type != 'vt') write("Parsing Texture vertices (vt)...");
							which_v = 'texture';
						}
						else if(c_type == 'vn'){
							if(p_type != 'vn') write("Parsing Vertex normals (vn)...");
							which_v = "normals";
						}
						else if(c_type == 'vp'){
							if(p_type != 'vp') write("Parsing Parameter space vertices (vp)...");
							which_v = "parameter_space";
						}

						if(obj == null) obj = {};
						if(!obj.vertices) obj.vertices = {};
						if(!obj.vertices[which_v]) obj.vertices[which_v] = [];
						
						for(var v = 1; v < line.length; v++){
							if(line[v] != null && line[v] != undefined && line[v] != ''){
								obj.vertices[which_v].push(parseFloat(line[v]));
							}
						}
						break;
					case 'p': //points
						if(p_type != 'p') write("Paring Points (p)...");
						if(!obj.point){obj.point = [];}
						for(var p = 1; p < line.length; p++){
							if(line[p] == '\\'){
								i++;
								line = lines[i].split(' ');
								p = 0;
							}
							obj.point.push(parseInt(line[p]));
						}
						break;
					case 'l': //lines
						if(p_type != 'l') write("Parsing line vertex (l)...");
						if(obj == null){obj = {};}
						if(!obj.line) obj.line = {vertex: [], texture: null}
						var vals = null;
						var hasTxt = (line[1].indexOf('/') > -1);
						if(hasTxt && obj.line.texture == null) obj.line.texture = [];
						for(var l = 1; l < line.length; l++){
							if(hasTxt){
								vals = line[l].split('/');
								obj.line.vertex.push(parseFloat(vals[0]));
								obj.line.texture.push(parseFloat(vals[1]));
							}
							else{
								obj.line.vertex.push(parseFloat(line[l]));
							}
						}
						break;
					case 'f': //faces
						if(p_type != 'f') write("Parsing Faces (f)...");
						if(obj == null) obj = {};
						if(!obj.faces) obj.faces = {};
						
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
					case 'o': // Object name
						write("Parsing Object (o): " + line[1]);
						if(obj == null) obj = {};
						obj.name = line[1];
						break;
					case 'g': // Group name
						write("Parsing Group name (g)");
						if(obj == null) obj = {};
						obj.group = line.slice(1, line.length);
						break;
					case 'mg': // Merging group
						write("Parsing Merging group (mg)");
						if(obj == null) obj = {};
						obj.mergin_group = [
							parseInt(line[1]), // Group number
							parseFloat(line[2]) // resolution
						];
						break;
					case 's': // Smoothing Group
						write("Parsing Smoothing Group (s)...");
						obj.smoothing = line[1];
						break;
					case 'cstype': // Curve or Surface type
						write("Parsing cstype...");
						obj.cstype = {};
						if(line.length > 2){
							obj.cstype.rat = line[1];
							obj.cstype.type = line[2];
						} else{
							obj.cstype.type = line[1];
						}
						break;
					case 'deg': // Degree
					case 'step': // Step
						write("Parsing " + (c_type == "deg" ? "Degrees" : "Step") + " (" + c_type + ")...");
						obj[c_type] = [parseInt(line[1])];
						if(line.length > 2){
							obj[c_type].push(parseInt(line[2]));
						}
						break;
					case 'curv': // Curve
						write("Parsing Curve (curv)...");
						obj.curv = {u:null, v:[]};
						obj.curv.u = [parseFloat(line[1]), parseFloat(line[2])]; //[start, end]
						for(var c = 3; c < line.length; c++){
							if(line[c] == '\\'){
								i++;
								line = lines[i].split(' ');
								c = 0;
							}

							obj.curv.v.push(parseInt(line[c]));
						}
						break;
					case 'curv2': // 2D Curve
						write("Parsing Curve 2D (curv2)...");
						obj.curv2 = [];
						for(var c = 1; c < line.length; c++){
							if(line[c] == '\\'){
								i++;
								line = lines[i].split(' ');
								c = 0;
							}

							obj.curv2.push(parseInt(line[c]));
						}
						break;
					case 'parm': // Global Parameters
						write("Parsing Global Parameters (parm)...");
						if(!obj.parm){obj.parm = {};}
						var ptype = line[1]; // u or v
						obj.parm[ptype] = [];
						for(var p = 2; p < line.length; p++){
							if(line[p] == '\\'){
								i++;
								line = lines[i].split(' ');
								p = 0;
							}
							obj.parm[ptype].push(parseFloat(line[p]));
						}
						break;
					case 'surf': // Surface
						write("Parsing Surface (surf)...");
						obj.surf = {u:null, v: null, vertices: null};
						obj.surf.u = [parseFloat(line[1]), parseFloat(line[2])];
						obj.surf.v = [parseFloat(line[3], parseFloat(line[4]))];
						var ver = [];
						var txt = null; // texture vertex
						var nrm = null; // normals
						var verts;
						for(var v = 5; v < line.length; v++){
							if(line[v] == '\\'){
								i++;
								line = lines[i].split(' ');
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
						obj.surf.vertices = {vertex: ver, texture: txt, normals: nrm};

						break;
					case 'trim': // Trimming loop
					case 'hole': // Trimming loop (hole)
					case 'scrv': // Special Curve
						if(c_type == "scrv") write("Parsing Special Curve");
						else write("Parsing Trimming Loop" + c_type == "hole" ? " (hole)" : "" + "...");
						if(!obj[c_type]) obj[c_type] = [];
						obj[c_type].push([parseFloat(line[1]), parseFloat(line[2]), parseInt(line[3])]);
						break;
					case 'sp': // Special Point
						write("Parsing Special Point (sp)...");
						obj['sp'] = [parseInt(line[1]), parseInt(line[2])];
						break;
					case 'bmat': // basis matrix
						var uv = line[1];
						write("Parsing basis matrix " + uv + " (" + c_type + ")...");
						if(!obj.deg || obj.deg.length < 2){
							write("Error: No DEG value found, can't parse basis martix...");
							break;
						}
						if(!obj[c_type]) obj[c_type] = {};
						if(!obj[c_type][uv]) obj[c_type][uv] = [];
						var matCt = obj.deg[uv == 'u' ? 0 : 1] + 1;
						for(var b = 2; b < line.length; b++){
							if(line[b] == "\\"){break;}
							if(line[b] != ''){
								obj[c_type][uv].push(uv == 'u' ? parseInt(line[b]) : parseFloat(line[b]));
							}	
						}
						matCt--;
						matCt = matCt + i;
						for(var bl = i + 1; bl <= matCt; bl++){
							line = lines[bl];
							if(line != undefined && line != ''){
								line = line.split(' ');
								var val = null;
								for(var lIdx = 0; lIdx < line.length; lIdx++){
									val = line[lIdx];
									if(val != '' && val != '\\'){
										obj[c_type][uv].push(uv == 'u' ? parseInt(val) : parseFloat(val));
									}
								}

								i++;
							}
						}
						break;
					case 'con': // Connectivity
						write("Parsing Connectivity (con)...");
						if(obj == null) obj = {};
						obj.con = [
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
						if(obj == null) obj = {};
						obj.bevel = line[1]; // on or off
						break;
					case 'c_interp': // Color Interpolation
						write('Parseing Color Interplation (c_interp)...');
						if(obj == null) obj = {};
						obj.color_interp = line[1]; // on or off
						break;
					case 'd_interp': // Dissolve Interpolation
						write("Parsing Dissolve Interpolation (d_interp)...");
						if(obj == null) obj = {};
						obj.dissolve_interp = line[1]; // on or off
						break;
					case 'lod': // Level of Detail
						write("Parsing Level of Detail (lod)...");
						if(obj == null) obj = {};
						obj.level_detail = parseInt(line[1]);
						break;
					case 'maplib': // Map Library
						write("Parsing Map Library (maplib)...");
						if(obj == null) obj = {};
						obj.map_lib = line.slice(1, line.length);
						break;
					case 'usemap': // Texture map
						write("Parsing Texture Map (usemap)...");
						if(obj == nul) obj = {};
						obj.usemap = line[1]; // map name or off
						break;
					case 'shadow_obj': //Shadow obj filename
						write("Parsing Shadow obj filename (shadow_obj)...");
						if(obj == null) obj = {};
						obj.shadow_obj = line[1];
						break;
					case 'trace_obj': // Ray Tracing filename
						write("Parsing Ray Tracing Filename (trace_obj)...");
						obj.ray_trace_filename = line[1];
						break;
					case 'ctech': // Curve approx Technique
						write("Parsing Curve Approx Technique (ctech)...");
						if(obj == null) obj = {};
						obj.curve_tech = {technique: line[1]};
						if(line.length > 3){
							obj.curve_tech.max_dist = parseFloat(line[2]);
							obj.curve_tech.max_angle = parseFloat(line[3]);
						}
						else{
							if(line[1] == "cparm"){
								obj.curve_tech.res = parseFloat(line[2]);
							} else{
								obj.curve_tech.max_len = parseInt(line[2]);
							}
						}
						break;
					case 'stech': // Surface Technique
						write("Parseing Surface Technique (stech)...");
						if(obj == null) obj = {};
						obj.surface_tech = {technique: line[1]};
						switch(line[1]){
							case 'cparma':
								obj.surface_tech.resolution =[
									parseFloat(line[2]), // U
									parseFloat(line[3])  // V
								];
								break;
							case 'cparmb':
								obj.surface_tech.resolution = parseFloat(line[2]); // uv
								break;
							case 'cspace':
								obj.surface_tech.max_len = parseInt(line[2]); // max length
								break;
							case 'curv':
								obj.surface_tech.max_dist = parseFloat(line[2]); // max distance
								obj.surface_tech.max_angle = parseFloat(line[3]); // max angle
								break;
						}
						break;
					case 'bsp': // B-spline patch
						write("Parsing B-Spline Patch (bsp)...");
						if(obj == null) obj = {};
						obj.b_spline_patch = [];
						for(var b = 1; b < line.length; b++){
							if(line[b] == '\\'){
								i++;
								line = lines[i].split(' ');
								b = 0;
							}
							obj.b_spline_patch.push(parseInt(line[b]));
						}
						break;
					case 'bzp': // Bezier Patch
						write("Parsing Bezier Patch (bzp)...");
						if(obj == null) obj = {};
						obj.bezier_patch = [];
						for(var b = 1; b < line.length; b++){
							if(line[b] == '\\'){
								i++;
								line = lines[i].split(' ');
								b = 0;
							}
							obj.bezier_patch.push(parseInt(line[b]));
						}
						break;
					case 'cdc': // Cardinal Curve Patch
						write("Parsing Cardinal Curve Patch (cdc)...");
						if(obj == null) obj = {};
						obj.cardinal_curv_patch = [];
						for(var c = 1; c < line.length; c++){
							if(line[c] == '\\'){
								i++;
								line = lines[i].split(' ');
								c = 0;
							}
							obj.cardinal_curv_patch.push(parseInt(line[c]));
						}
						break;
					case 'cdp': // Cardinal Patch
						write("Parsing Cardinal Patch (cdp)...");
						if(obj == null) obj = {};
						obj.cardinal_patch = [];
						for(var c = 1; c < line.length; c++){
							if(line[c] == '\\'){
								i++;
								line = lines[i].split(' ');
								c = 0;
							}
							obj.cardinal_patch.push(parseInt(line[c]));
						}
						break;
					case 'res': // Reference
						write('Parsing Reference (res)...');
						if(obj == null) obj = {};
						obj.reference = {
							useg: parseInt(line[1]),
							vseg: parseInt(line[2])
						}
						break;
					default:
						write("Unprocessed Line: (#" + i + ") " + lines[i]);
				}
			}
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
				var jsonFile = getJsonFilePath();
				writeToConsole("Saving JSON file...");

				if(isAsync){
					fs.writeFile(jsonFile, json, function(wErr){
						if(wErr){
							err = "Error: Saving JSON file: " + wErr;
							write(err);
						}
						else{
							write("JSON saved to file " + jsonFile);
						}

						cbFunc(err, opts.returnJSON ? json : null);
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
		var logFile = getLogFilePath();

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

			parseFileAsync(file, function(err, data){	
				processJSON(data, function(err, json){
					if(json != null){
						data.json = json;
					}

					write("Memory usage before parse: " + util.inspect(s_mem, {depth:null}));
					var u_mem = process.memoryUsage();
					write("Memory usage after parse: " + util.inspect(u_mem, {depth: null}));
					write("Total memory used: " + (u_mem.heapUsed - s_mem.heapUsed))

					var ov_e_time = process.hrtime(ov_s_time);
					write("Overall Run Time: " + ov_e_time[0] + "s, " + ov_e_time[1] + "ns");

					saveLog(function(err){
						cbFunc(err, data);
					});
				});
			});
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
	var json = processJSON(parsedObj.data);

	write("Memory usage before parse: " + util.inspect(s_mem, {depth:null}));
	var u_mem = process.memoryUsage();
	write("Memory usage after parse: " + util.inspect(u_mem, {depth: null}));
	write("Total memory used: " + (u_mem.heapUsed - s_mem.heapUsed))

	var ov_e_time = process.hrtime(ov_s_time);
	write("Overall Run Time: " + ov_e_time[0] + "s, " + ov_e_time[1] + "ns");

	saveLog();

	var rData = {err: err, data: parsedObj};
	if(json) rData.json = json;

	return rData;
}

exports.parse = parse;
exports.parseSync = parseSync;