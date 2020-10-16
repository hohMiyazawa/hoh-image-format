const BYTE_LENGTH = 8;

const internal_formats = [
	"bit","greyscale","greyscalea","rgb","rgba","yiq","yiqa","ycocg","ycocga","indexed","indexeda","verbatim","verbatima","verbatimgreyscale","verbatimbit"
]

function rePlex(integer,base){
	if(!base){
		base = BYTE_LENGTH
	}
	return new Array(base).fill(0).map(
		(_,index) => ((integer & (1 << ((base - 1) - index))) > 0) + 0
	)
}

function dePlex(bitArray){
	return bitArray.reduce(
		(acc,bit,index) => acc + bit * (1 << ((bitArray.length - 1) - index)),
		0
	)
}

function encodeVarint(integer,base,derivative){
	if(!base){
		base = BYTE_LENGTH
	}
	let carryBit = +!!derivative;
	let range = Math.pow(2,base - 1)
	if(integer >= range){
		return encodeVarint(
			integer >> (base - 1),
			base,
			true
		).concat(
			carryBit,
			rePlex(integer % range,base - 1)
		)
	}
	return [carryBit].concat(rePlex(integer,base - 1))
}

let lossless_encoder = function(data,info,options){
	console.info("ENCODING");
	let t0 = performance.now()
	if(info.pixelFormat !== "rgba"){
		throw "unsupported pixel format"
	}
	const width = info.width;
	const height = info.height;
	const encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));
	if(info.pixelFormat === "rgba" && options.detectAlpha){
		if(!hasAlpha(data,width,height)){
			info.pixelFormat = "rgb";
			data = rgba_to_rgb(data)
		}
	}
	if((info.pixelFormat === "rgba" || info.pixelFormat === "rgb") && options.detectGreyscale){
		if(!hasColour(data,width,height)){
			if(info.pixelFormat === "rgba"){
				data = rgba_to_greyscalea(data)
				info.pixelFormat = "greyscalea";
			}
			else if(info.pixelFormat === "rgb"){
				data = rgb_to_greyscale(data)
				info.pixelFormat = "greyscale";
			}
		}
	}
	if(options.colourTransform === "YIQ"){
		if(info.pixelFormat === "rgba"){
			data = rgba_to_yiqa(data)
			info.pixelFormat = "yiqa";
		}
		else if(info.pixelFormat === "rgb"){
			data = rgb_to_yiq(data)
			info.pixelFormat = "yiq";
		}
	}
	console.info("Colour transforms performed");

	let encodedData = [];
	let bitBuffer = [];

	let writeByteNative = function(integer){
		bitBuffer = bitBuffer.concat(rePlex(integer));
		encodedData.push(dePlex(bitBuffer.splice(0,BYTE_LENGTH)));
	}
	let writeBitNative = function(integer){
		bitBuffer.push(integer);
		if(bitBuffer.length > (BYTE_LENGTH - 1)){
			encodedData.push(dePlex(bitBuffer.splice(0,BYTE_LENGTH)))
		}
	}
	let flushBitBuffer = function(){
		while(bitBuffer.length > (BYTE_LENGTH - 1)){
			encodedData.push(dePlex(bitBuffer.splice(0,BYTE_LENGTH)))
		}
	}

	writeByteNative(72);writeByteNative(79);writeByteNative(72);
	bitBuffer.push(...encodeVarint(width,BYTE_LENGTH));
	bitBuffer.push(...encodeVarint(height,BYTE_LENGTH));
	writeByteNative(internal_formats.indexOf(info.pixelFormat));

	writeBitNative(+options.palette);
	writeBitNative(+options.histogram);
	writeBitNative(+options.crossPrediction);
	writeBitNative(+options.crossPredictionColour);
	writeBitNative(+options.interleave);
	writeBitNative(0);
	writeBitNative(0);
	writeBitNative(0);

	console.info("Header written");

	let encodingQueue = [];
	let blockQueue = [{size: encoding_size,x:0,y:0}];
	let partitionBits = [];
	while(blockQueue.length){
		let last = blockQueue.pop();
		if(options.optimisePartitioning && last.size/2 >= options.minModuleSize && (blockQueue.length + encodingQueue.length) === 0){
			partitionBits.push(1);
			let s = last.size/2;
			if(height > last.y + s){
				if(width > last.x + s){
					blockQueue.push({size: s,x:last.x + s,y:last.y + s})
				}
				blockQueue.push({size: s,x:last.x,y:last.y + s})
			}
			if(width > last.x + s){
				blockQueue.push({size: s,x:last.x + s,y:last.y})
			}
			blockQueue.push({size: s,x:last.x,y:last.y})
		}
		else{
			partitionBits.push(0);
			encodingQueue.push(last)
		}
	}
	while(partitionBits.length % BYTE_LENGTH){
		partitionBits.push(0);
	}
	bitBuffer.push(...partitionBits);

	console.info("Partition performed");

	let channel_numbers = {
		"yiq": 3,
		"rgb": 3,
		"yiqa": 4,
		"rgba": 4,
		"greyscale": 1,
		"greyscalea": 2,
	}

	let channels = deSerialize(data,channel_numbers[info.pixelFormat]);

	let moduleData;
	moduleData = encodingQueue.map(module => {
		let trueWidth = Math.min(module.size,width - module.x);
		let trueHeight = Math.min(module.size,height - module.y);
		let m_data;
		if(info.pixelFormat === "yiq"){
			console.info("Starting Y...");
			const Y_patch = getPatch(
				channels[0],width,height,
				module.x,module.y,
				trueWidth,
				trueHeight
			);
			let Y_data = encodeChannel_lossless(
				Y_patch,
				{range: 256,name: "Y",width: trueWidth,height: trueHeight},
				options,
				{}
			)
			console.info("Starting I...");
			let I_data = encodeChannel_lossless(
				getPatch(
					channels[1],width,height,
					module.x,module.y,
					trueWidth,
					trueHeight
				),
				{range: 511,name: "I",width: trueWidth,height: trueHeight},
				options,
				{luma: Y_patch,lumaRange: 256}
			)
			console.info("Starting Q...");
			let Q_data = encodeChannel_lossless(
				getPatch(
					channels[2],width,height,
					module.x,module.y,
					trueWidth ,
					trueHeight
				),
				{range: 511,name: "Q",width: trueWidth,height: trueHeight},
				options,
				{luma: Y_patch,lumaRange: 256}
			)
			m_data = Y_data.concat(I_data).concat(Q_data)
		}
		else if(info.pixelFormat === "yiqa"){

		}
		else if(info.pixelFormat === "rgb"){
			console.info("Starting R...");
			let R_data = encodeChannel_lossless(
				getPatch(
					channels[0],width,height,
					module.x,module.y,
					trueWidth,
					trueHeight
				),
				{range: 256,name: "R",width: trueWidth,height: trueHeight},
				options,
				{}
			)
			console.info("Starting G...");
			let G_data = encodeChannel_lossless(
				getPatch(
					channels[1],width,height,
					module.x,module.y,
					trueWidth,
					trueHeight
				),
				{range: 256,name: "G",width: trueWidth,height: trueHeight},
				options,
				{}
			)
			console.info("Starting B...");
			let B_data = encodeChannel_lossless(
				getPatch(
					channels[2],width,height,
					module.x,module.y,
					trueWidth,
					trueHeight
				),
				{range: 256,name: "B",width: trueWidth,height: trueHeight},
				options,
				{}
			)
			rm_data = R_data.concat(G_data).concat(B_data)
		}
		else if(info.pixelFormat === "greyscale"){
			console.info("Starting Y...");
			let Y_data = encodeChannel_lossless(
				getPatch(
					data,width,height,
					module.x,module.y,
					trueWidth,
					trueHeight
				),
				{range: 256,name: "Y",width: trueWidth,height: trueHeight},
				options,
				{}
			)
			m_data = Y_data
		}

		if(options.attemptIndexedColour && channel_numbers[info.pixelFormat] > 1){
			if(info.pixelFormat === "yiq"){
				let local_patch = yiq_to_rgb(getPatch(
					data,width,height,
					module.x,module.y,
					trueWidth,
					trueHeight
				));
				let check = check_index(local_patch);
				if(check){
					let index_data = encodeChannel_lossless(
						rgb_to_indexed(local_patch,check),
						{range: check.length,name: "index",width: trueWidth,height: trueHeight,indexed: true,index: check},
						options,
						{}
					);
					if(index_data.length < m_data.length){
						m_data = index_data
					}
				}
			}
		}
		return m_data
	})

	console.info("Modules compressed");

	if(options.interleave){
		throw "interleaving not supported yet"
	}
	else{
		moduleData.forEach(module => {
			module.forEach(byte => writeByteNative(byte))
		})
	}

	console.info("Data joined");

	while(bitBuffer.length % BYTE_LENGTH){
		bitBuffer.push(0);
	}
	flushBitBuffer();
	let t1 = performance.now();
	console.log("encoding took",t1-t0,"ms");
	return Uint8Array.from(encodedData)
}

let lossless_decoder = function(data,info,options,callback){
	console.info("DECODING");
	let currentIndex = 1;
	let bitBuffer = rePlex(data[0]);
	let readByteNative = function(){
		if(currentIndex < data.length){
			bitBuffer = bitBuffer.concat(rePlex(data[currentIndex++]))
		}
		else if(bifBuffer.length < BYTE_LENGTH){
			throw "unexpeced end of file"
		}
		return dePlex(bitBuffer.splice(0,BYTE_LENGTH))
	}
	let readBit = function(){
		if(bitBuffer.length === 0){
			if(currentIndex < data.length){
				bitBuffer = bitBuffer.concat(rePlex(data[currentIndex++]))
			}
			else{
				throw "unexpeced end of file"
			}
		}
		return bitBuffer.splice(0,1)[0]
	}
	if(!(readByteNative() === 72 && readByteNative() === 79 && readByteNative() === 72)){
		return{
			imageData: null,
			error: "not a hoh image. Signature does not match"
		}
	}
	let readVarint = function(base){
		if(!base){
			base = BYTE_LENGTH
		}
		let buffer = [];
		while(readBit()){
			if(bitBuffer.length < (BYTE_LENGTH - 1)){
				bitBuffer = bitBuffer.concat(rePlex(data[currentIndex++]))
			}
			buffer = buffer.concat(bitBuffer.splice(0,BYTE_LENGTH - 1))
		}
		if(bitBuffer.length < (BYTE_LENGTH - 1)){
			bitBuffer = bitBuffer.concat(rePlex(data[currentIndex++]))
		}
		buffer = buffer.concat(bitBuffer.splice(0,BYTE_LENGTH - 1));
		return dePlex(buffer);
	}
	const width = readVarint(BYTE_LENGTH);
	const height = readVarint(BYTE_LENGTH);
	console.log("dimensions",width,height);
	const encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));

	let colourFormat = internal_formats[readByteNative()];
	console.log("pixel format",colourFormat);

	let parameters = {};
	parameters.palette = !!readBit();
	parameters.histogram = !!readBit();
	parameters.crossPrediction = !!readBit();
	parameters.crossPredictionColour = !!readBit();
	parameters.interleave = !!readBit();
	readBit();readBit();readBit();
	console.log("parameters",parameters);

	let decodingQueue = [];
	let blockQueue = [{size: encoding_size,x:0,y:0}];
	let partitionBitsRead = 0;
	while(blockQueue.length){
		let last = blockQueue.pop();
		if(readBit()){
			let s = last.size/2;
			if(height > last.y + s){
				if(width > last.x + s){
					blockQueue.push({size: s,x:last.x + s,y:last.y + s})
				}
				blockQueue.push({size: s,x:last.x,y:last.y + s})
			}
			if(width > last.x + s){
				blockQueue.push({size: s,x:last.x + s,y:last.y})
			}
			blockQueue.push({size: s,x:last.x,y:last.y})
		}
		else{
			decodingQueue.push(last)
		}
		partitionBitsRead++
	}
	while(partitionBitsRead % BYTE_LENGTH){
		partitionBitsRead++;
		readBit()
	}

	let decodedData = new Array(width*height*4).fill(0);
	
	let moduleDigest = module => {
		let worker = new Worker("lossless_decoder.js");
		let trueWidth = Math.min(module.size,width - module.x);
		let trueHeight = Math.min(module.size,height - module.y);
		if(colourFormat === "yiq"){
			let Y_decoded;
			let I_decoded;
			let Q_decoded

			let bitLength_Y = readVarint(BYTE_LENGTH);
			let dataLength_Y = Math.ceil(bitLength_Y / BYTE_LENGTH);
			let data_Y = data.slice(currentIndex,currentIndex + dataLength_Y);
			currentIndex += dataLength_Y;

			let bitLength_I;
			let dataLength_I;
			let data_I;

			let bitLength_Q;
			let dataLength_Q;
			let data_Q;

			if(!(data_Y[0] >> 7)){
				bitLength_I = readVarint(BYTE_LENGTH);
				dataLength_I = Math.ceil(bitLength_I / BYTE_LENGTH);
				data_I = data.slice(currentIndex,currentIndex + dataLength_I);
				currentIndex += dataLength_I;

				bitLength_Q = readVarint(BYTE_LENGTH);
				dataLength_Q = Math.ceil(bitLength_Q / BYTE_LENGTH);
				data_Q = data.slice(currentIndex,currentIndex + dataLength_Q);
				currentIndex += dataLength_Q;
			}

			let Y_recieve = function(e){
				if(e.data.isIndex){
					let index_data = e.data.data;
					console.info("Index decoded");
					for(let j=0;j<trueHeight;j++){
						for(let i=0;i<trueWidth;i++){
							let R = index_data[(j*trueWidth + i)][0];
							let G = index_data[(j*trueWidth + i)][1];
							let B = index_data[(j*trueWidth + i)][2];
							decodedData[((j+module.y)*width + module.x + i)*4] = R;
							decodedData[((j+module.y)*width + module.x + i)*4 + 1] = G;
							decodedData[((j+module.y)*width + module.x + i)*4 + 2] = B;
							decodedData[((j+module.y)*width + module.x + i)*4 + 3] = 255;
						}
					}
					callback({
						imageData: decodedData,
						width: width,
						height: height
					})
				}
				else{
					Y_decoded = e.data;
					console.info("Y decoded");

					worker.onmessage = I_recieve;
					worker.postMessage([
						data_I,
						{
							range: 511,
							name: "I",
							width: trueWidth,
							height: Math.min(module.size,height - module.y),
							bitLength: bitLength_I
						},
						parameters,
						{luma: Y_decoded,lumaRange: 256}
					])
				}
			}
			let I_recieve = function(e){
				I_decoded = e.data;
				console.info("I decoded");

				worker.onmessage = Q_recieve;
				worker.postMessage([
					data_Q,
					{
						range: 511,
						name: "Q",
						width: trueWidth,
						height: Math.min(module.size,height - module.y),
						bitLength: bitLength_Q
					},
					parameters,
					{luma: Y_decoded,lumaRange: 256}
				])
			}
			let Q_recieve = function(e){
				Q_decoded = e.data;
				console.info("Q decoded");

				let decodedModule = yiq_to_rgba(serialize([Y_decoded,I_decoded,Q_decoded]));
				console.log("first pix yiq",Y_decoded[0],I_decoded[0],Q_decoded[0]);
				for(let j=0;j<trueHeight;j++){
					for(let i=0;i<trueWidth;i++){
						let R = decodedModule[(j*trueWidth + i)*4];
						let G = decodedModule[(j*trueWidth + i)*4 + 1];
						let B = decodedModule[(j*trueWidth + i)*4 + 2];
						let A = decodedModule[(j*trueWidth + i)*4 + 3];
						decodedData[((j+module.y)*width + module.x + i)*4] = R;
						decodedData[((j+module.y)*width + module.x + i)*4 + 1] = G;
						decodedData[((j+module.y)*width + module.x + i)*4 + 2] = B;
						decodedData[((j+module.y)*width + module.x + i)*4 + 3] = A;
					}
				}
				callback({
					imageData: decodedData,
					width: width,
					height: height
				})
			}
			worker.onmessage = Y_recieve;
			worker.postMessage([
				data_Y,
				{
					range: 256,
					name: "Y",
					width: trueWidth,
					height: Math.min(module.size,height - module.y),
					bitLength: bitLength_Y
				},
				parameters,
				{}
			])
		}
		else if(colourFormat === "rgb"){
			let bitLength = readVarint(BYTE_LENGTH);
			let dataLength = Math.ceil(bitLength / BYTE_LENGTH);
			let R_decoded = decodeChannel_lossless(
				data.slice(currentIndex,currentIndex + dataLength),
				{
					range: 256,
					name: "R",
					width: Math.min(module.size,width - module.x),
					height: Math.min(module.size,height - module.y),
					bitLength: bitLength
				},
				options,
				{}
			);
			currentIndex += dataLength;
			console.info("R decoded");

			bitLength = readVarint(BYTE_LENGTH);
			dataLength = Math.ceil(bitLength / BYTE_LENGTH);
			let G_decoded = decodeChannel_lossless(
				data.slice(currentIndex,currentIndex + dataLength),
				{
					range: 256,
					name: "G",
					width: Math.min(module.size,width - module.x),
					height: Math.min(module.size,height - module.y),
					bitLength: bitLength
				},
				options,
				{}
			);
			currentIndex += dataLength;
			console.info("G decoded");

			bitLength = readVarint(BYTE_LENGTH);
			dataLength = Math.ceil(bitLength / BYTE_LENGTH);
			let B_decoded = decodeChannel_lossless(
				data.slice(currentIndex,currentIndex + dataLength),
				{
					range: 256,
					name: "B",
					width: Math.min(module.size,width - module.x),
					height: Math.min(module.size,height - module.y),
					bitLength: bitLength
				},
				options,
				{}
			);
			currentIndex += dataLength;
			console.info("B decoded");

			let decodedModule = serialize([R_decoded,G_decoded,B_decoded]);
			for(let j=0;j<module.size;j++){
				for(let i=0;i<trueWidth;i++){
					let R = decodedModule[(j*Math.min(module.size,width - module.x) + i)*3];
					let G = decodedModule[(j*Math.min(module.size,width - module.x) + i)*3 + 1];
					let B = decodedModule[(j*Math.min(module.size,width - module.x) + i)*3 + 2];
					let A = 255;
					decodedData[((j+module.y)*width + module.x + i)*4] = R;
					decodedData[((j+module.y)*width + module.x + i)*4 + 1] = G;
					decodedData[((j+module.y)*width + module.x + i)*4 + 2] = B;
					decodedData[((j+module.y)*width + module.x + i)*4 + 3] = A;
				}
			}
		}
		else if(colourFormat === "greyscale"){
			let bitLength = readVarint(BYTE_LENGTH);
			let dataLength = Math.ceil(bitLength / BYTE_LENGTH);
			let data_Y = data.slice(currentIndex,currentIndex + dataLength);
			currentIndex += dataLength;

			worker.onmessage = function(e){
				let decodedModule = greyscale_to_rgb(e.data);
				for(let j=0;j<module.size;j++){
					for(let i=0;i<trueWidth;i++){
						let R = decodedModule[(j*Math.min(module.size,width - module.x) + i)*3];
						let G = decodedModule[(j*Math.min(module.size,width - module.x) + i)*3 + 1];
						let B = decodedModule[(j*Math.min(module.size,width - module.x) + i)*3 + 2];
						decodedData[((j+module.y)*width + module.x + i)*4] = R;
						decodedData[((j+module.y)*width + module.x + i)*4 + 1] = G;
						decodedData[((j+module.y)*width + module.x + i)*4 + 2] = B;
						decodedData[((j+module.y)*width + module.x + i)*4 + 3] = 255;
					}
				}
				callback({
					imageData: decodedData,
					width: width,
					height: height
				})
			};
			worker.postMessage([
				data_Y,
				{
					range: 256,
					name: "Y",
					width: trueWidth,
					height: Math.min(module.size,height - module.y),
					bitLength: bitLength
				},
				parameters,
				{}
			])
		}
	}
	decodingQueue.forEach(module => {
		moduleDigest(module)
	})
}
