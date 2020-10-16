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

	if(info.pixelFormat === "yiq"){
		let channels = deSerialize(data,3);
	}
	else if(info.pixelFormat === "yiqa"){
		let channels = deSerialize(data,4);
	}


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
	
	

	let t1 = performance.now();
	console.log("decoding took",t1-t0,"ms");
	//return decodedData;
}
