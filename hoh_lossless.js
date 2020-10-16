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
		//no partitioning so far
		partitionBits.push(0);
		encodingQueue.push(last)
	}
	while(partitionBits.length % BYTE_LENGTH){
		partitionBits.push(0);
	}
	bitBuffer.push(...partitionBits);

	console.info("Partition performed");

	let moduleData;
	if(info.pixelFormat === "yiq"){
		let channels = deSerialize(data,3);
		moduleData = encodingQueue.map(module => {
			console.info("Starting Y...");
			let Y_data = encodeChannel_lossless(
				getPatch(
					channels[0],width,height,
					module.x,module.y,
					module.size,module.size
				),
				{range: 256,name: "Y",width: width,height: height},
				options,
				{}
			)
			console.info("Starting I...");
			let I_data = encodeChannel_lossless(
				getPatch(
					channels[0],width,height,
					module.x,module.y,
					module.size,module.size
				),
				{range: 511,name: "I",width: width,height: height},
				options,
				{}
			)
			console.info("Starting Q...");
			let Q_data = encodeChannel_lossless(
				getPatch(
					channels[0],width,height,
					module.x,module.y,
					module.size,module.size
				),
				{range: 511,name: "Q",width: width,height: height},
				options,
				{}
			)
			return Y_data.concat(I_data).concat(Q_data)
		})
	}
	else if(info.pixelFormat === "yiqa"){
		let channels = deSerialize(data,4);
	}
	else if(info.pixelFormat === "rgb"){
		let channels = deSerialize(data,3);
		moduleData = encodingQueue.map(module => {
			console.info("Starting R...");
			let R_data = encodeChannel_lossless(
				getPatch(
					channels[0],width,height,
					module.x,module.y,
					module.size,module.size
				),
				{range: 256,name: "R",width: width,height: height},
				options,
				{}
			)
			console.info("Starting G...");
			let G_data = encodeChannel_lossless(
				getPatch(
					channels[0],width,height,
					module.x,module.y,
					module.size,module.size
				),
				{range: 256,name: "G",width: width,height: height},
				options,
				{}
			)
			console.info("Starting B...");
			let B_data = encodeChannel_lossless(
				getPatch(
					channels[0],width,height,
					module.x,module.y,
					module.size,module.size
				),
				{range: 256,name: "B",width: width,height: height},
				options,
				{}
			)
			return R_data.concat(G_data).concat(B_data)
		})
	}

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

let lossless_decoder = function(data,info,options){
	console.info("DECODING");
	let t0 = performance.now()
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
		//no partitioning so far
		if(readBit()){
			throw "not implemented"
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

	console.log(bitBuffer.length,"warning");
	
	decodingQueue.forEach(module => {
		if(colourFormat === "yiq"){
			let bitLength = readVarint(BYTE_LENGTH);
			let dataLength = Math.ceil(bitLength / BYTE_LENGTH);
			module.Y_decoded = decodeChannel_lossless(
				data.slice(currentIndex,currentIndex + dataLength),
				{range: 256,name: "Y",width: module.size,height: module.size,bitLength: bitLength},
				options,
				{}
			);
			currentIndex += dataLength;
			console.info("Y decoded");

			bitLength = readVarint(BYTE_LENGTH);
			dataLength = Math.ceil(bitLength / BYTE_LENGTH);
			module.I_decoded = decodeChannel_lossless(
				data.slice(currentIndex,currentIndex + dataLength),
				{range: 511,name: "I",width: module.size,height: module.size,bitLength: bitLength},
				options,
				{}
			);
			currentIndex += dataLength;
			console.info("I decoded");

			bitLength = readVarint(BYTE_LENGTH);
			dataLength = Math.ceil(bitLength / BYTE_LENGTH);
			module.Q_decoded = decodeChannel_lossless(
				data.slice(currentIndex,currentIndex + dataLength),
				{range: 511,name: "Q",width: module.size,height: module.size,bitLength: bitLength},
				options,
				{}
			);
			currentIndex += dataLength;
			console.info("Q decoded");
		}
	})
	console.log(decodingQueue)

	let t1 = performance.now();
	console.log("decoding took",t1-t0,"ms");
	//return decodedData;
}
