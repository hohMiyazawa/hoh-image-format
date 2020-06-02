const BYTE_LENGTH = 8;
const BYTE_POWER = Math.pow(2,BYTE_LENGTH);
const BYTE_MAX_VAL = BYTE_POWER - 1;


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

function rgba_to_yiq26a(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = R - B;
		let Cg = G - ((R + B)>>1);

		outBuffer[i] = Y;
		outBuffer[i + 1] = Co + BYTE_POWER;
		outBuffer[i + 2] = Cg + BYTE_POWER;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function rgba_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		outBuffer.push(imageData[i],imageData[i+1],imageData[i+2])
	}
	return outBuffer
}

function rgb_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		outBuffer.push(imageData[i],imageData[i+1],imageData[i+2],255)
	}
	return outBuffer
}

function check_rgba_alpha(imageData){
	for(let i=3;i<imageData.length;i += 4){
		if(imageData[i] !== 255){
			return false
		}
	}
	return true
}

function rgb_to_greyscale(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		outBuffer.push(Math.round((imageData[i] + imageData[i + 1] + imageData[i + 2])/3))
	}
	return outBuffer
}

function greyscale_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i++){
		outBuffer.push(imageData[i],imageData[i],imageData[i])
	}
	return outBuffer
}

function check_tripplets(imageData){
	for(let i=0;i<imageData.length;i += 3){
		if(
			imageData[i] !== imageData[i + 1]
			|| imageData[i] !== imageData[i + 2]
		){
			return false
		}
	}
	return true
}

function greyscale_to_bitmap(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i++){
		outBuffer.push((imageData[i] < 128 ? 0 : 1))
	}
	return outBuffer
}

function check_bitmap(imageData){
	for(let i=0;i<imageData.length;i++){
		if(
			imageData[i] !== 0
			&& imageData[i] !== 255
		){
			return false
		}
	}
	return true
}

function rgb_to_yiq26(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = R - B;
		let Cg = G - ((R + B)>>1);

		outBuffer[i] = Y;
		outBuffer[i + 1] = Co + BYTE_POWER;
		outBuffer[i + 2] = Cg + BYTE_POWER
	}
	return outBuffer
}

function yiq26a_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let Y = imageData[i];
		let Co = imageData[i + 1] - BYTE_POWER;
		let Cg = imageData[i + 2] - BYTE_POWER;
		let G = Y - ((-Cg)>>1);
		let B = Y + ((1-Cg)>>1) - (Co>>1);
		let R = Co + B;

		outBuffer[i] = R;
		outBuffer[i + 1] = G;
		outBuffer[i + 2] = B;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function yiq26_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let Y = imageData[i];
		let Co = imageData[i + 1] - BYTE_POWER;
		let Cg = imageData[i + 2] - BYTE_POWER;
		let G = Y - ((-Cg)>>1);
		let B = Y + ((1-Cg)>>1) - (Co>>1);
		let R = Co + B;

		outBuffer[i] = R;
		outBuffer[i + 1] = G;
		outBuffer[i + 2] = B
	}
	return outBuffer
}

function add8bitAlpha(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		outBuffer.push(imageData[i]);
		outBuffer.push(imageData[i + 1]);
		outBuffer.push(imageData[i + 2]);
		outBuffer.push(255);
	}
	return outBuffer
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

function multiplexChannels(channelArray){
	let imageData = [];
	let width = channelArray[0].length;
	let height = channelArray[0][0].length;
	for(let j=0;j<height;j++){
		for(let i=0;i<width;i++){
			for(let k=0;k<channelArray.length;k++){
				imageData.push(channelArray[k][i][j])
			}
		}
	}
	return imageData
}

function deMultiplexChannels(imageData,width,height){
	let channelArray = [];
	let channelNumber = imageData.length/(width * height);
	if(channelNumber !== Math.round(channelNumber)){
		throw "invalid image data"
	}
	for(let i=0;i<channelNumber;i++){
		let channel = [];
		for(let j=0;j<width;j++){
			channel.push([])
		}
		channelArray.push(channel);
	}
	for(let i=0;i<width;i++){
		for(let j=0;j<height;j++){
			for(let k=0;k<channelNumber;k++){
				channelArray[k][i][j] = imageData[(j * width + i)*channelNumber + k]
			}
		}
	}
	return channelArray
}

function createHuffman(freqs){
	let workList = [];
	let sizeUsed = 0;
	Object.keys(freqs).forEach(symbol => {
		if(freqs[symbol]){
			workList.push({
				isInternal: false,
				symbol: symbol,
				frequency: freqs[symbol]
			});
			sizeUsed += freqs[symbol]
		}
	});
	if(!workList.length){
		workList.push({
			isInternal: false,
			symbol: Object.keys(freqs)[0],
			frequency: 0
		})
	}
	while(workList.length > 1){
		workList.sort((b,a) => a.frequency - b.frequency);
		let newInternal = {
			isInternal: true,
			right: workList.pop(),
			left: workList.pop()
		}
		newInternal.frequency = newInternal.left.frequency + newInternal.right.frequency;
		workList.push(newInternal)
	}
	return workList[0]
}

function buildBook(huffmanTree){
	let traverse = function(huffNode,prefix){
		if(huffNode.isInternal){
			return traverse(
				huffNode.left,
				prefix.concat(0)
			).concat(
				traverse(
					huffNode.right,
					prefix.concat(1)
				)
			)
		}
		else{
			return [{
				symbol: huffNode.symbol,
				frequency: huffNode.frequency,
				code: prefix
			}]
		}
	}
	let book = {};
	traverse(huffmanTree,[]).forEach(entry => {
		book[entry.symbol] = entry.code
	})
	return book
}

function primitive_huffman(states){
	let base_freq = [];
	let start = 10000;
	for(let i=0;i<states;i++){
		base_freq.push(start);
		start = Math.round(start * (1/2 + (0.9 - 1/Math.sqrt(states))/2));
	}
	return createHuffman(base_freq)
}

function find_average(chunck,ceiling){
	let sum = 0;
	for(let i=0;i < chunck.length;i++){
		for(let j=0;j < chunck[i].length;j++){
			if(Math.abs(chunck[i][j] - ceiling) < Math.abs(chunck[i][j])){
				sum += chunck[i][j] - ceiling
			}
			else if(Math.abs(chunck[i][j] + ceiling) < Math.abs(chunck[i][j])){
				sum += chunck[i][j] + ceiling
			}
			else{
				sum += chunck[i][j]
			}
		}
	}
	return Math.round(sum/(chunck.length * chunck[0].length))
}

function create_uniform(colour,size){
	let data = [];
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			col.push(colour)
		}
		data.push(col)
	}
	return data
}

function create_vertical_gradient(colour1,colour2,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			col.push(Math.round(colour1 + (colour2 - colour1) * j /(size - 1)))
		}
		data.push(col)
	}
	return data
}

function create_horizontal_gradient(colour1,colour2,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			col.push(Math.round(colour1 + (colour2 - colour1) * i /(size - 1)))
		}
		data.push(col)
	}
	return data
}

function create_diagonal_gradient(colour1,colour2,direction,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				col.push(Math.round(colour1 + (colour2 - colour1) * ((size - i - 1) + j)/(2*size - 2)))
			}
			else{
				col.push(Math.round(colour1 + (colour2 - colour1) * (i + j)/(2*size - 2)))
			}
		}
		data.push(col)
	}
	return data
}

function create_diagonal_solid(colour1,colour2,direction,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				if((size - i - 1) + j < size){
					col.push(colour1)
				}
				else{
					col.push(colour2)
				}
			}
			else{
				if(i + j < size){
					col.push(colour1)
				}
				else{
					col.push(colour2)
				}
			}
		}
		data.push(col)
	}
	return data
}

function create_odd_solid(colour1,colour2,direction,steep,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				if(steep){
					if((size - i - 1) < size/4){
						col.push(colour1)
					}
					else if((size - i - 1) >= 3*size/4){
						col.push(colour2)
					}
					else if(((size - i - 1) - size/4)*2 + j === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if(((size - i - 1) - size/4)*2 + j < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(j < size/4){
						col.push(colour1)
					}
					else if(j >= 3*size/4){
						col.push(colour2)
					}
					else if((j - size/4)*2 + (size - i - 1) === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if((j - size/4)*2 + (size - i - 1) < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
			else{
				if(steep){
					if(i < size/4){
						col.push(colour1)
					}
					else if(i >= 3*size/4){
						col.push(colour2)
					}
					else if((i - size/4)*2 + j === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if((i - size/4)*2 + j < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(j < size/4){
						col.push(colour1)
					}
					else if(j >= 3*size/4){
						col.push(colour2)
					}
					else if((j - size/4)*2 + i === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if((j - size/4)*2 + i < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
		}
		data.push(col)
	}
	return data
}

function create_dip(colour1,colour2,direction,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				col.push(Math.round(colour2 + (colour1 - colour2) * Math.abs(i - j)/(size - 1)))
			}
			else{
				col.push(Math.round(colour2 + (colour1 - colour2) * Math.abs((size - i - 1) - j)/(size - 1)))
			}
		}
		data.push(col)
	}
	return data
}

function create_third(colour1,colour2,direction,fullness,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				if(fullness){
					if(j < Math.round(2*size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(j < Math.round(size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
			else{
				if(fullness){
					if(i < Math.round(2*size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(i < Math.round(size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
		}
		data.push(col)
	}
	return data
}

function create_dct(colour1,colour2,h_freq,v_freq,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			let abo = Math.abs(Math.cos(i*h_freq*Math.PI/(size-1)) + Math.cos(j*v_freq*Math.PI/(size-1)))/2;
			col.push(Math.round(colour1 * abo + colour2 * (1-abo)))
		}
		data.push(col)
	}
	return data
}

function sample(chunck,arr){
	let size = chunck.length;
	let dct = arr;
	let sum_a = 0;
	let count_a = 0;
	let sum_b = 0;
	let count_b = 0;
	for(let i=0;i<size;i++){
		for(let j=0;j<size;j++){
			if(dct[i][j] < 0.2){
				sum_a += chunck[i][j];
				count_a++
			}
			else if(dct[i][j] > 0.8){
				sum_b += chunck[i][j];
				count_b++
			}
		}
	}
	return [Math.round(sum_a/count_a),Math.round(sum_b/count_b)]
}

function sample_dct(chunck,h_freq,v_freq){
	let size = chunck.length;
	let dct = create_dct(0,1,h_freq,v_freq,size);
	return sample(chunck,dct);
}

const smallSymbolTable = [
	"pixels",
	"whole",
	"STOP",
	"vertical",
	"horizontal",
	"diagonal_solid_NW",
	"diagonal_solid_NE",
	"diagonal_solid_SW",
	"diagonal_solid_SE",
	"cross",
	"PREVIOUS",
	"TOP"
]

const largeSymbolTable = [
	"divide",
	"whole",
	"STOP",
	"vertical",
	"vertical_i",
	"horizontal",
	"horizontal_i",
	"diagonal_NW",
	"diagonal_NE",
	"diagonal_NW_i",
	"diagonal_NE_i",
	"diagonal_solid_NW",
	"diagonal_solid_NE",
	"steep_NW",
	"steep_NE",
	"calm_NW",
	"calm_NE",
	"dip_NW",
	"dip_NE",
	"dip_NW_i",
	"dip_NE_i",
	"horizontal_third",
	"horizontal_large_third",
	"vertical_third",
	"vertical_large_third",
	"dct01",
	"dct10",
	"dct03",
	"dct30",
	"dct11",
	"dct22",
	"dct33",
	"dct12",
	"dct13",
	"dct21",
	"dct31",
	"dct02",
	"dct20",
	"dct32",
	"dct23",
	"PREVIOUS",
	"TOP",
	"TOPLEFT",
	"TOPRIGHT"
]

const internal_formats = [
	"bit","greyscale","greyscalea","rgb","rgba","yiq26","yiq26a"
]

function encoder(imageData,options){
	console.info("ENCODING");
	const width = options.width;
	const height = options.height;
	const encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));
	if(!internal_formats.includes(options.pixelFormat)){
		throw "only " + internal_formats.join(", ") + " supported"
	}
	if(options.target_pixelFormat && !internal_formats.includes(options.target_pixelFormat)){
		throw "only " + internal_formats.join(", ") + " supported"
	}

	if(!options.target_pixelFormat){
		if(options.pixelFormat === "rgb"){
			options.target_pixelFormat === "yiq26"
		}
		else if(options.pixelFormat === "rgba"){
			options.target_pixelFormat === "yiq26a"
		}
		else{
			options.target_pixelFormat = options.pixelFormat
		}
	}
	if(options.optimizeChannels){
		if(options.pixelFormat === "rgba"){
			if(check_rgba_alpha(imageData)){
				console.log("removing redundant alpha");
				imageData = rgba_to_rgb(imageData);
				options.pixelFormat = "rgb";
				if(options.target_pixelFormat === "yiq26a"){
					options.target_pixelFormat = "yiq26"
				}
			}
		}
		if(options.pixelFormat === "rgb"){
			if(check_tripplets(imageData)){
				console.log("removing redundant chroma channels");
				imageData = rgb_to_greyscale(imageData);
				options.pixelFormat = "greyscale";
				options.target_pixelFormat = "greyscale"
			}
		}
		if(options.pixelFormat === "greyscale"){
			if(check_bitmap(imageData)){
				console.log("encoding as bitmap");
				imageData = greyscale_to_bitmap(imageData);
				options.pixelFormat = "bit";
				options.target_pixelFormat = "bit";
			}
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

//write header
	writeByteNative(72);writeByteNative(79);writeByteNative(72);
	writeByteNative(0);
	bitBuffer.push(...encodeVarint(width,BYTE_LENGTH));
	bitBuffer.push(...encodeVarint(height,BYTE_LENGTH));
	writeByteNative(internal_formats.indexOf(options.target_pixelFormat));
	bitBuffer.push(...encodeVarint(0,BYTE_LENGTH));//still image
//end write header


	encodeChannel = function(channelData,options){
		const CHANNEL_LENGTH = options.bitDepth;
		const CHANNEL_POWER = Math.pow(2,CHANNEL_LENGTH);
		const CHANNEL_MAX_VAL = CHANNEL_POWER - 1;

		let aritmetic_queue = [];

		let stats = {
			s_whole: 0,
			s_vertical: 0,
			s_horizontal: 0,
			s_pixels: 0,
			s_diagonal_solid_NW: 0,
			s_diagonal_solid_NE: 0,
			s_diagonal_solid_SW: 0,
			s_diagonal_solid_SE: 0,
			s_cross: 0,
			s_STOP: 0,
			s_PREVIOUS: 0,
			s_TOP: 0,
			STOP: 0,
			divide: 0,
			whole: 0,
			vertical: 0,
			vertical_i: 0,
			horizontal: 0,
			horizontal_i: 0,
			diagonal_NW: 0,
			diagonal_NE: 0,
			diagonal_NW_i: 0,
			diagonal_NE_i: 0,
			diagonal_solid_NW: 0,
			diagonal_solid_NE: 0,
			steep_NW: 0,
			steep_NE: 0,
			calm_NW: 0,
			calm_NE: 0,
			dip_NW: 0,
			dip_NE: 0,
			dip_NW_i: 0,
			dip_NE_i: 0,
			horizontal_third: 0,
			horizontal_large_third: 0,
			vertical_third: 0,
			vertical_large_third: 0,
			dct01: 0,
			dct10: 0,
			dct03: 0,
			dct30: 0,
			dct11: 0,
			dct22: 0,
			dct33: 0,
			dct12: 0,
			dct13: 0,
			dct21: 0,
			dct31: 0,
			dct02: 0,
			dct20: 0,
			dct32: 0,
			dct23: 0,
			PREVIOUS: 0,
			TOP: 0,
			TOPLEFT: 0,
			TOPRIGHT: 0
		}

		let table_ceiling = CHANNEL_POWER;
		let occupied;
		let frequencyTable;
		let delta_data;
		let range_data;
		if(CHANNEL_LENGTH > 1){
//tables
			frequencyTable = new Array(CHANNEL_POWER).fill(0);
			for(let i=0;i<channelData.length;i++){
				for(let j=0;j<channelData[0].length;j++){
					frequencyTable[channelData[i][j]]++;
				}
			};
			occupied = frequencyTable.filter(a => a).length;
			console.log(options.name,Math.round(100*occupied/frequencyTable.length) + "%",frequencyTable);
			console.log(options.name,"raw table size",CHANNEL_POWER);
			delta_data = rePlex(occupied,CHANNEL_LENGTH);
			let delta = 0;

			const PRIMITIVE = buildBook(primitive_huffman(CHANNEL_POWER));

			for(let i=0;i<CHANNEL_POWER;i++){
				delta++;
				if(frequencyTable[i]){
					delta_data = delta_data.concat(PRIMITIVE[delta - 1]);
					delta = 0
				}
			}
			console.log(options.name,"delta table size",delta_data.length,delta_data);
		
			range_data = [];
			let rangeActive = false;
			delta = 0;
			let shift_counter = 0;
			let nums = [];
			for(let i=0;i<CHANNEL_POWER;i++){
				delta++;
				if(
					(frequencyTable[i] && rangeActive === false)
					|| (!frequencyTable[i] && rangeActive === true)
				){
					rangeActive = !rangeActive;
					shift_counter++;
					nums.push(delta);
					range_data = range_data.concat(PRIMITIVE[delta - 1]);
					delta = 0;

				}
				if(
					i === CHANNEL_MAX_VAL
					&& rangeActive
				){
					range_data = range_data.concat(PRIMITIVE[delta]);
					shift_counter++;
					nums.push(delta)
				}
			}
			//console.log("nums",nums);
			range_data = rePlex(shift_counter/2,CHANNEL_LENGTH - 1).concat(range_data);
			console.log(range_data);
			console.log(options.name,"range delta table size",range_data.length);

			let translationTable = new Array(CHANNEL_POWER);
			delta = 0;
			for(let i=0;i<CHANNEL_POWER;i++){
				if(
					frequencyTable[i]
				){
					translationTable[i] = delta;
					delta++
				}
			}
			table_ceiling = delta;
			console.log("table ceiling",table_ceiling);

			for(let i=0;i<channelData.length;i++){
				for(let j=0;j<channelData[0].length;j++){
					channelData[i][j] = translationTable[channelData[i][j]]
				}
			}
		}
//end tables
			
		let currentEncode = [];
		for(let i=0;i<channelData.length;i++){
			currentEncode.push(new Array(height).fill(0))
		}
		let forbidden = [];
		for(let i=0;i<channelData.length;i++){
			forbidden.push(new Array(height).fill(false))
		}

		let error_compare = function(chunck1,chunck2,offx,offy){
			if(
				false
				&& chunck1.length === 4
				&& offx >= 2 && offy >= 2
				&& (offx + 4) <= width
				&& (offy + 4) <= height
			){
				let sumError = 0;
				if(!(
					(
						channelData[offx][offy] === channelData[offx - 2][offy]
						&& channelData[offx + 1][offy] === channelData[offx - 1][offy]
						&& channelData[offx + 1][offy + 1] === channelData[offx - 1][offy + 1]
						&& channelData[offx][offy + 1] === channelData[offx - 2][offy + 1]
					)
					|| (
						channelData[offx][offy] === channelData[offx][offy - 2]
						&& channelData[offx + 1][offy] === channelData[offx + 1][offy - 2]
						&& channelData[offx + 1][offy + 1] === channelData[offx + 1][offy - 1]
						&& channelData[offx][offy + 1] === channelData[offx][offy - 1]
					)
				)){
					for(let i=0;i<2;i++){
						for(let j=0;j<2;j++){
							let diff = Math.abs(
								chunck2[i][j] - chunck1[i][j]
							) % table_ceiling;
							let error = Math.pow(
								Math.min(diff,table_ceiling - diff),
								2
							)
							sumError += error
						}
					}
				}
				if(!(
					(
						channelData[offx + 2][offy] === channelData[offx][offy]
						&& channelData[offx + 3][offy] === channelData[offx + 1][offy]
						&& channelData[offx + 3][offy + 1] === channelData[offx + 1][offy + 1]
						&& channelData[offx + 2][offy + 1] === channelData[offx][offy + 1]
					)
					|| (
						channelData[offx + 2][offy] === channelData[offx + 2][offy - 2]
						&& channelData[offx + 3][offy] === channelData[offx + 3][offy - 2]
						&& channelData[offx + 3][offy + 1] === channelData[offx + 3][offy - 1]
						&& channelData[offx + 2][offy + 1] === channelData[offx + 2][offy - 1]
					)
				)){
					for(let i=2;i<4;i++){
						for(let j=0;j<2;j++){
							let diff = Math.abs(
								chunck2[i][j] - chunck1[i][j]
							) % table_ceiling;
							let error = Math.pow(
								Math.min(diff,table_ceiling - diff),
								2
							)
							sumError += error
						}
					}
				}
				if(!(
					(
						channelData[offx + 2][offy + 2] === channelData[offx - 2][offy + 2]
						&& channelData[offx + 3][offy + 2] === channelData[offx - 1][offy + 2]
						&& channelData[offx + 3][offy + 3] === channelData[offx - 1][offy + 3]
						&& channelData[offx + 2][offy + 3] === channelData[offx - 2][offy + 3]
					)
					|| (
						channelData[offx + 2][offy + 2] === channelData[offx + 2][offy]
						&& channelData[offx + 3][offy + 2] === channelData[offx + 3][offy]
						&& channelData[offx + 3][offy + 3] === channelData[offx + 3][offy + 1]
						&& channelData[offx + 2][offy + 3] === channelData[offx + 2][offy + 1]
					)
				)){
					for(let i=2;i<4;i++){
						for(let j=2;j<4;j++){
							let diff = Math.abs(
								chunck2[i][j] - chunck1[i][j]
							) % table_ceiling;
							let error = Math.pow(
								Math.min(diff,table_ceiling - diff),
								2
							)
							sumError += error
						}
					}
				}
				if(!(
					(
						channelData[offx][offy + 2] === channelData[offx - 2][offy + 2]
						&& channelData[offx + 1][offy + 2] === channelData[offx - 1][offy + 2]
						&& channelData[offx + 1][offy + 3] === channelData[offx - 1][offy + 3]
						&& channelData[offx][offy + 3] === channelData[offx - 2][offy + 3]
					)
					|| (
						channelData[offx][offy + 2] === channelData[offx][offy]
						&& channelData[offx + 1][offy + 2] === channelData[offx + 1][offy]
						&& channelData[offx + 1][offy + 3] === channelData[offx + 1][offy + 1]
						&& channelData[offx][offy + 3] === channelData[offx][offy + 1]
					)
				)){
					for(let i=0;i<2;i++){
						for(let j=2;j<4;j++){
							let diff = Math.abs(
								chunck2[i][j] - chunck1[i][j]
							) % table_ceiling;
							let error = Math.pow(
								Math.min(diff,table_ceiling - diff),
								2
							)
							sumError += error
						}
					}
				}
				return sumError/16
			}
			else{
				let sumError = 0;
				for(let i=0;i<chunck1.length;i++){
					for(let j=0;j<chunck1[i].length;j++){
						if(offx + i < width && offy + j < height){
							let diff = Math.abs(
								chunck2[i][j] - chunck1[i][j]
							) % table_ceiling;
							let error = Math.pow(
								Math.min(diff,table_ceiling - diff),
								2
							)
							sumError += error
						}
					}
				}
				return sumError/(chunck1.length * chunck1[0].length)
			}
		}
		const get_chunck = function(x,y,size){
			let data = [];
			for(let i=x;i<x + size;i++){
				let col = [];
				if(i >= width){
					for(let j=y;j<y + size;j++){
						let edgeDiff = (channelData[width - 1][j] || channelData[width - 1][height - 1])
							- (currentEncode[width - 1][j] || currentEncode[width - 1][height - 1])
						col.push(edgeDiff)
					}
				}
				else{
					for(let j=y;j<y + size;j++){
						if(j >= height){
							col.push(channelData[i][height - 1] - currentEncode[i][height - 1])
						}
						else{
							col.push(channelData[i][j] - currentEncode[i][j])
						}
					}
				}
				data.push(col)
			}
			return data
		}

		let smallSymbolFrequency = {};
		smallSymbolTable.forEach(word => smallSymbolFrequency[word] = 0);

		let largeSymbolFrequency = {};
		largeSymbolTable.forEach(word => largeSymbolFrequency[word] = 0);

		let integerFrequency = new Array(CHANNEL_POWER).fill(0);

		let writeSmallSymbol = function(symbol){
			aritmetic_queue.push({size: "small",symbol: symbol});
			smallSymbolFrequency[symbol]++
			stats["s_" + symbol]++;
		}
		let writeLargeSymbol = function(symbol){
			aritmetic_queue.push({size: "large",symbol: symbol});
			largeSymbolFrequency[symbol]++;
			stats[symbol]++;
		}

		let writeByte = function(integer){
			if(integer !== Math.round(integer)){
				throw "fractional"
			}
			if(integer < 0){
				integer += table_ceiling
			}
			if(integer < 0){
				console.log(integer,table_ceiling);
				throw "bad";
			}
			aritmetic_queue.push(integer);
			integerFrequency[integer]++
		}
		/*let writeByte = function(integer){
			let encodedInteger = integer - forige;
			forige = integer;
			if(encodedInteger < 0){
				encodedInteger += CHANNEL_POWER
			}
			aritmetic_queue.push(encodedInteger);
			integerFrequency[encodedInteger]++
		}*/

		let sharpener = function(a,b,chuncker,resolver,symbol,tuning,inverse){
			if(!tuning){
				tuning = 1
			}
			if(a < 0){
				a += table_ceiling
			}
			if(b < 0){
				b += table_ceiling
			}
			if(inverse){
				if(b > a){
					b -= table_ceiling
				}
				else{
					a -= table_ceiling
				}
			}
			let patch = chuncker(a,b);
			let error = resolver(patch);
			if(options.force){
				let new_a = Math.min(a + 1,table_ceiling);
				let diff = 1;
				if(a < b){
					new_a = Math.max(a - 1,0);
					diff = -1
				}
				let new_patch = chuncker(new_a,b);
				let new_error = resolver(new_patch);
				while(new_error < error){
					a = new_a;
					patch = new_patch;
					error = new_error;
					new_a = Math.min(table_ceiling,Math.max(a + diff,-table_ceiling));
					new_patch = chuncker(new_a,b);
					new_error = resolver(new_patch)
				}
				/*let new_b = Math.min(max_val,Math.max(b - diff,0));
				new_error = resolver(a,new_b);
				while(new_error < error){
					b = new_b;
					error = new_error;
					new_b = Math.min(max_val,Math.max(b - diff,0));
					new_error = resolver(a,new_b)
				}*/
			}
			return {
				symbol: symbol,
				error: error * tuning,
				colours: [a,b],
				patch: patch
			}
		}

		let write2x2 = function(curr,a,b,c,d){
			if(curr.x + 1 < width){
				if(curr.y + 1 < height){
					currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
					currentEncode[curr.x + 1][curr.y] = (currentEncode[curr.x + 1][curr.y] + b) % table_ceiling;
					currentEncode[curr.x + 1][curr.y + 1] = (currentEncode[curr.x + 1][curr.y + 1] + c) % table_ceiling;
					currentEncode[curr.x][curr.y + 1] = (currentEncode[curr.x][curr.y + 1] + d) % table_ceiling;
				}
				else{
					currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
					currentEncode[curr.x + 1][curr.y] = (currentEncode[curr.x + 1][curr.y] + b) % table_ceiling;
				}
			}
			else{
				if(curr.y + 1 < height){
					currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
					currentEncode[curr.x][curr.y + 1] = (currentEncode[curr.x][curr.y + 1] + d) % table_ceiling;
				}
				else{
					currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
				}
			}
		}
		let write2x2directly = function(curr,a,b,c,d){
			if(curr.x + 1 < width){
				if(curr.y + 1 < height){
					currentEncode[curr.x][curr.y] = a
					currentEncode[curr.x + 1][curr.y] = b
					currentEncode[curr.x + 1][curr.y + 1] = c
					currentEncode[curr.x][curr.y + 1] = d
				}
				else{
					currentEncode[curr.x][curr.y] = a
					currentEncode[curr.x + 1][curr.y] = b
				}
			}
			else{
				if(curr.y + 1 < height){
					currentEncode[curr.x][curr.y] = a
					currentEncode[curr.x][curr.y + 1] = d
				}
				else{
					currentEncode[curr.x][curr.y] = a
				}
			}
		}
		let test2x2 = function(curr){
			if(curr.x + 1 < width){
				if(curr.y + 1 < height){
					return currentEncode[curr.x][curr.y] === channelData[curr.x][curr.y]
					&& currentEncode[curr.x + 1][curr.y] === channelData[curr.x + 1][curr.y]
					&& currentEncode[curr.x + 1][curr.y + 1] === channelData[curr.x + 1][curr.y + 1]
					&& currentEncode[curr.x][curr.y + 1] === channelData[curr.x][curr.y + 1]
				}
				else{
					return currentEncode[curr.x][curr.y] === channelData[curr.x][curr.y]
					&& currentEncode[curr.x + 1][curr.y] === channelData[curr.x + 1][curr.y]
				}
			}
			else{
				if(curr.y + 1 < height){
					return currentEncode[curr.x][curr.y] === channelData[curr.x][curr.y]
					&& currentEncode[curr.x][curr.y + 1] === channelData[curr.x][curr.y + 1]
				}
				else{
					return currentEncode[curr.x][curr.y] === channelData[curr.x][curr.y]
				}
			}
		}

		for(let size = encoding_size; size > 1;size = size/2){
		for(let x = 0;x < width;x += size){
		for(let y = 0;y < height;y += size){
			let curr = {x: x,y: y,size: size};
			if(forbidden[x][y]){
				continue
			}
			if(curr.size > options.maxBlockSize){
				writeLargeSymbol("divide");
				continue
			}

			let chunck = get_chunck(curr.x,curr.y,curr.size);
			let perfect = chunck.flat().map(a => Math.abs(a)).sort((b,a) => a - b)[0];
			if(curr.size > 200){
				//console.log(curr.size,chunck.flat().map(a => a).length,JSON.parse(JSON.stringify(chunck)))
			}
			if(curr.size >= 4){
				if(perfect <= options.quantizer){
					writeLargeSymbol("STOP");
					for(let i=0;i<curr.size;i++){
						for(let j=0;j<curr.size;j++){
							if((curr.x + i) < width && (curr.y + j) < height){
								forbidden[curr.x + i][curr.y + j] = true
							}
						}
					}
					continue;
				}
				let average = find_average(chunck,table_ceiling);
				let mArr = [
					find_average(get_chunck(curr.x,curr.y,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + curr.size/4,curr.y,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 2*curr.size/4,curr.y,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 3*curr.size/4,curr.y,curr.size/4),table_ceiling),

					find_average(get_chunck(curr.x,curr.y + curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + curr.size/4,curr.y + curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 2*curr.size/4,curr.y + curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 3*curr.size/4,curr.y + curr.size/4,curr.size/4),table_ceiling),

					find_average(get_chunck(curr.x,curr.y + 2*curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + curr.size/4,curr.y + 2*curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 2*curr.size/4,curr.y + 2*curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 3*curr.size/4,curr.y + 2*curr.size/4,curr.size/4),table_ceiling),

					find_average(get_chunck(curr.x,curr.y + 3*curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + curr.size/4,curr.y + 3*curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 2*curr.size/4,curr.y + 3*curr.size/4,curr.size/4),table_ceiling),
					find_average(get_chunck(curr.x + 3*curr.size/4,curr.y + 3*curr.size/4,curr.size/4),table_ceiling)
				];
				const top = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[3])/4);
				const bottom = Math.round((mArr[12] + mArr[13] + mArr[14] +mArr[15])/4);
				let left = Math.round((mArr[0] + mArr[4] + mArr[8] + mArr[12])/4);
				let right = Math.round((mArr[3] + mArr[7] + mArr[11] + mArr[15])/4);

				let NW = mArr[0];
				let SE = mArr[15];

				let NE = mArr[3];
				let SW = mArr[12];

				let NW_s = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[4] + mArr[5] + mArr[8])/6);
				let SE_s = Math.round((mArr[7] + mArr[10] + mArr[11] + mArr[13] + mArr[14] + mArr[15])/6);

				let NE_s = Math.round((mArr[1] + mArr[2] + mArr[3] + mArr[6] + mArr[7] + mArr[11])/6);
				let SW_s = Math.round((mArr[4] + mArr[8] + mArr[9] + mArr[12] + mArr[13] + mArr[14])/6);

				let steep_NW = Math.round((mArr[0] + mArr[1] + mArr[4] + mArr[5] + mArr[8] + mArr[12])/6);
				let steep_SE = Math.round((mArr[3] + mArr[7] + mArr[10] + mArr[11] + mArr[14] + mArr[15])/6);

				let calm_NW = Math.round((mArr[0] + mArr[1] + mArr[4] + mArr[5] + mArr[2] + mArr[3])/6);
				let calm_SE = Math.round((mArr[12] + mArr[13] + mArr[10] + mArr[11] + mArr[14] + mArr[15])/6);

				let steep_NE = Math.round((mArr[3] + mArr[2] + mArr[7] + mArr[6] + mArr[11] + mArr[15])/6);
				let steep_SW = Math.round((mArr[0] + mArr[4] + mArr[8] + mArr[9] + mArr[12] + mArr[13])/6);

				let calm_NE = Math.round((mArr[0] + mArr[1] + mArr[6] + mArr[7] + mArr[2] + mArr[3])/6);
				let calm_SW = Math.round((mArr[12] + mArr[13] + mArr[8] + mArr[9] + mArr[14] + mArr[15])/6);

				let corner_NW_SE = Math.round((mArr[0]*2 + mArr[1] + mArr[4] + mArr[11] + mArr[14] + mArr[15]*2)/8);
				let skraa_NE_SW = Math.round((mArr[3] + mArr[6] + mArr[9] + mArr[12])/4);

				let corner_NE_SW = Math.round((mArr[2] + mArr[3]*2 + mArr[7] + mArr[8] + mArr[12]*2 + mArr[13])/8);
				let skraa_NW_SE = Math.round((mArr[0] + mArr[5] + mArr[10] + mArr[15])/4);

				let left_third_large = Math.round((
					mArr[0] + mArr[1] + mArr[4] + mArr[5] + mArr[8] + mArr[9] + mArr[12] + mArr[13]
					+ mArr[2]/2 + mArr[6]/2 + mArr[10]/2 + mArr[14]/2
				)/10);
				let right_third_small = Math.round((mArr[3] + mArr[7] + mArr[11] + mArr[15])/4);

				let left_third_small = Math.round((mArr[0] + mArr[4] + mArr[8] + mArr[12])/4);
				let right_third_large = Math.round((
					mArr[3] + mArr[7] + mArr[11] + mArr[15] + mArr[2] + mArr[6] + mArr[10] + mArr[14]
					+ mArr[1]/2 + mArr[5]/2 + mArr[9]/2 + mArr[13]/2
				)/10);

				let top_third_large = Math.round((
					mArr[0] + mArr[1] + mArr[2] + mArr[3] + mArr[4] + mArr[5] + mArr[6] + mArr[7]
					 + mArr[8]/2 + mArr[9]/2 + mArr[10]/2 + mArr[11]/2
				)/10);
				let bottom_third_small = Math.round((mArr[12] + mArr[13] + mArr[14] + mArr[15])/4);

				let top_third_small = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[3])/4);
				let bottom_third_large = Math.round((
					mArr[8] + mArr[9] + mArr[10] + mArr[11] + mArr[12] + mArr[13] + mArr[14] + mArr[15]
					 + mArr[4]/2 + mArr[5]/2 + mArr[6]/2 + mArr[7]/2
				)/10);

				let middle_vertical = Math.round((mArr[1] + mArr[2] + mArr[5] + mArr[6] + mArr[9] + mArr[10] + mArr[13] + mArr[14])/8);
				let middle_horizontal = Math.round((mArr[4] + mArr[8] + mArr[5] + mArr[6] + mArr[9] + mArr[10] + mArr[7] + mArr[11])/8);

				let errorQueue = [];

				let flate = create_uniform(average,curr.size);
				let NOP = create_uniform(0,curr.size);
				let whole_error = error_compare(flate,chunck,curr.x,curr.y);
				let NOP_error = error_compare(NOP,chunck,curr.x,curr.y);
				errorQueue.push({
					symbol: "whole",
					error: whole_error*0.5,//tuning
					colours: [average],
					patch: flate
				})
				errorQueue.push({
					symbol: "divide",
					error: NOP_error*0.3,//tuning
					colours: [],
					patch: NOP
				})
				errorQueue.push(sharpener(
					top,
					bottom,
					(a,b) => create_vertical_gradient(a,b,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"vertical",
					1
				))
				errorQueue.push(sharpener(
					top,
					bottom,
					(a,b) => create_vertical_gradient(a,b,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"vertical_i",
					1,
					true
				))
				errorQueue.push(sharpener(
					left,
					right,
					(a,b) => create_horizontal_gradient(a,b,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"horizontal",
					1
				))
				errorQueue.push(sharpener(
					left,
					right,
					(a,b) => create_horizontal_gradient(a,b,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"horizontal_i",
					1,
					true
				))
				errorQueue.push(sharpener(
					NW,
					SE,
					(a,b) => create_diagonal_gradient(a,b,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_NW"
				))
				errorQueue.push(sharpener(
					NE,
					SW,
					(a,b) => create_diagonal_gradient(a,b,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_NE"
				))
				errorQueue.push(sharpener(
					NW,
					SE,
					(a,b) => create_diagonal_gradient(a,b,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_NW_i",
					1,
					true
				))
				errorQueue.push(sharpener(
					NE,
					SW,
					(a,b) => create_diagonal_gradient(a,b,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_NE_i",
					1,
					true
				))

				errorQueue.push(sharpener(
					NW_s,
					SE_s,
					(a,b) => create_diagonal_solid(a,b,false,curr.size),
					patch => 1.1*error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_solid_NW"
				))
				errorQueue.push(sharpener(
					NE_s,
					SW_s,
					(a,b) => create_diagonal_solid(a,b,true,curr.size),
					patch => 1.1*error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_solid_NE"
				))

				errorQueue.push(sharpener(
					steep_NW,
					steep_SE,
					(a,b) => create_odd_solid(a,b,false,true,curr.size),
					patch => 1.1*error_compare(chunck,patch,curr.x,curr.y),
					"steep_NW"
				))

				errorQueue.push(sharpener(
					calm_NW,
					calm_SE,
					(a,b) => create_odd_solid(a,b,false,false,curr.size),
					patch => 1.1*error_compare(chunck,patch,curr.x,curr.y),
					"calm_NW"
				))

				errorQueue.push(sharpener(
					steep_NE,
					steep_SW,
					(a,b) => create_odd_solid(a,b,true,true,curr.size),
					patch => 1.1*error_compare(chunck,patch,curr.x,curr.y),
					"steep_NE"
				))

				errorQueue.push(sharpener(
					calm_NE,
					calm_SW,
					(a,b) => create_odd_solid(a,b,true,false,curr.size),
					patch => 1.1*error_compare(chunck,patch,curr.x,curr.y),
					"calm_NE"
				))

				errorQueue.push(sharpener(
					corner_NW_SE,
					skraa_NE_SW,
					(a,b) => create_dip(a,b,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"dip_NW"
				))
				errorQueue.push(sharpener(
					corner_NE_SW,
					skraa_NW_SE,
					(a,b) => create_dip(a,b,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"dip_NE"
				))
				errorQueue.push(sharpener(
					corner_NW_SE,
					skraa_NE_SW,
					(a,b) => create_dip(a,b,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"dip_NW_i",
					1,true
				))
				errorQueue.push(sharpener(
					corner_NE_SW,
					skraa_NW_SE,
					(a,b) => create_dip(a,b,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"dip_NE_i",
					1,true
				))

				errorQueue.push(sharpener(
					left_third_large,
					right_third_small,
					(a,b) => create_third(a,b,false,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"horizontal_large_third"
				))
				errorQueue.push(sharpener(
					left_third_small,
					right_third_large,
					(a,b) => create_third(a,b,false,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"horizontal_third"
				))
				errorQueue.push(sharpener(
					top_third_large,
					bottom_third_small,
					(a,b) => create_third(a,b,true,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"vertical_large_third"
				))
				errorQueue.push(sharpener(
					top_third_small,
					bottom_third_large,
					(a,b) => create_third(a,b,true,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"vertical_third"
				))

				if(options.useDCT){
					errorQueue.push(sharpener(
						top,
						bottom,
						(a,b) => create_dct(a,b,0,1,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct01"
					))
					errorQueue.push(sharpener(
						left,
						right,
						(a,b) => create_dct(a,b,1,0,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct10"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,0,3),
						(a,b) => create_dct(a,b,0,3,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct03"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,3,0),
						(a,b) => create_dct(a,b,3,0,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct30"
					))

					errorQueue.push(sharpener(
						top,
						middle_horizontal,
						(a,b) => create_dct(a,b,0,2,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct02"
					))
					errorQueue.push(sharpener(
						left,
						middle_vertical,
						(a,b) => create_dct(a,b,2,0,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct20"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,2,3),
						(a,b) => create_dct(a,b,2,3,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct23"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,3,2),
						(a,b) => create_dct(a,b,3,2,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct32"
					))

					errorQueue.push(sharpener(
						corner_NW_SE,
						corner_NE_SW,
						(a,b) => create_dct(a,b,1,1,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct11"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,2,2),
						(a,b) => create_dct(a,b,2,2,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct22"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,3,3),
						(a,b) => create_dct(a,b,3,3,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct33"
					))
					errorQueue.push(sharpener(
						corner_NW_SE,
						corner_NE_SW,
						(a,b) => create_dct(a,b,1,2,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct12"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,1,3),
						(a,b) => create_dct(a,b,1,3,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct13"
					))	
					errorQueue.push(sharpener(
						corner_NW_SE,
						corner_NE_SW,
						(a,b) => create_dct(a,b,2,1,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct21"
					))
					errorQueue.push(sharpener(
						...sample_dct(chunck,3,1),
						(a,b) => create_dct(a,b,3,1,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dct31"
					))
				}
			
				if(curr.x !== 0){
					let previousPatch = [];
					for(let i=0;i<curr.size;i++){
						let col = [];
						if((curr.x + i) >= width){
							for(let j=0;j<curr.size;j++){
								col.push(0)
							}
						}
						else{
							for(let j=0;j<curr.size;j++){
								if((curr.y + j) >= height){
									col.push(0)
								}
								else{
									col.push(currentEncode[curr.x - curr.size + i][curr.y + j] - currentEncode[curr.x + i][curr.y + j] )
								}
							}
						}
						previousPatch.push(col);
					}

					errorQueue.push({
						symbol: "PREVIOUS",
						error: error_compare(chunck,previousPatch,curr.x,curr.y)*0.39,
						colours: [],
						patch: previousPatch
					})
				}
				if(curr.y !== 0){
					let topPatch = [];
					for(let i=0;i<curr.size;i++){
						let col = [];
						if((curr.x + i) >= width){
							for(let j=0;j<curr.size;j++){
								col.push(0)
							}
						}
						else{
							for(let j=0;j<curr.size;j++){
								if((curr.y + j) >= height){
									col.push(0)
								}
								else{
									col.push(currentEncode[curr.x + i][curr.y - curr.size + j] - currentEncode[curr.x + i][curr.y + j] )
								}
							}
						}
						topPatch.push(col);
					}

					errorQueue.push({
						symbol: "TOP",
						error: error_compare(chunck,topPatch,curr.x,curr.y)*0.39,
						colours: [],
						patch: topPatch
					})
				}

				if(curr.y !== 0 && curr.x !== 0){
					let topLeftPatch = [];
					for(let i=0;i<curr.size;i++){
						let col = [];
						if((curr.x + i) >= width){
							for(let j=0;j<curr.size;j++){
								col.push(0)
							}
						}
						else{
							for(let j=0;j<curr.size;j++){
								if((curr.y + j) >= height){
									col.push(0)
								}
								else{
									col.push(currentEncode[curr.x - curr.size + i][curr.y - curr.size + j] - currentEncode[curr.x + i][curr.y + j] )
								}
							}
						}
						topLeftPatch.push(col);
					}

					errorQueue.push({
						symbol: "TOPLEFT",
						error: error_compare(chunck,topLeftPatch,curr.x,curr.y)*0.39,
						colours: [],
						patch: topLeftPatch
					})
				}


				if(curr.y !== 0 && (curr.x + 2*curr.size) <= width){
					let topRightPatch = [];
					for(let i=0;i<curr.size;i++){
						let col = [];
						for(let j=0;j<curr.size;j++){
							if((curr.y + j) >= height){
								col.push(0)
							}
							else{
								col.push(currentEncode[curr.x + curr.size + i][curr.y - curr.size + j] - currentEncode[curr.x + i][curr.y + j] )
							}
						}
						topRightPatch.push(col);
					}

					errorQueue.push({
						symbol: "TOPRIGHT",
						error: error_compare(chunck,topRightPatch,curr.x,curr.y)*0.39,
						colours: [],
						patch: topRightPatch
					})
				}


				errorQueue.sort((a,b) => a.error - b.error);
				if(true){
					writeLargeSymbol(errorQueue[0].symbol);
					/*if(errorQueue[0].symbol === "dct31"){
						console.log(errorQueue)
					}*/
					errorQueue[0].colours.forEach(colour => {
						writeByte(colour);
					});
					for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
						for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
							currentEncode[i][j] = (currentEncode[i][j] + errorQueue[0].patch[i - curr.x][j - curr.y]) % table_ceiling;
							if(currentEncode[i][j] < 0){
								currentEncode[i][j] += table_ceiling
							}
							if(currentEncode[i][j] !== Math.round(currentEncode[i][j])){
								console.log(errorQueue[0]);
								throw "awful"
							}
						}
					}
				}

				/*for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
					for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
						currentEncode[i][j] = (currentEncode[i][j] + selected_patch[i - curr.x][j - curr.y]) % table_ceiling;
						if(currentEncode[i][j] < 0){
							currentEncode[i][j] += table_ceiling
						}
					}
				}*/
				//writeLargeSymbol("divide");
			}
			else if(curr.size === 2){
				if(perfect <= options.quantizer){
					writeSmallSymbol("STOP");
					continue;
				}
				if(CHANNEL_LENGTH === 1){
					if(chunck[0][0] === -1){
						chunck[0][0] = 1
					}
					if(chunck[0][1] === -1){
						chunck[0][1] = 1
					}
					if(chunck[1][0] === -1){
						chunck[1][0] = 1
					}
					if(chunck[1][1] === -1){
						chunck[1][1] = 1
					}
				}
				if(curr.x !== 0){
					if(curr.x + 1 === width){
					}
					else if(curr.y + 1 === height){
					}
					else{
						if(
							channelData[curr.x][curr.y] === channelData[curr.x - 2][curr.y]
							&& channelData[curr.x + 1][curr.y] === channelData[curr.x - 1][curr.y]
							&& channelData[curr.x][curr.y + 1] === channelData[curr.x - 2][curr.y + 1]
							&& channelData[curr.x + 1][curr.y + 1] === channelData[curr.x - 1][curr.y + 1]
						){
							writeSmallSymbol("PREVIOUS");
							write2x2directly(curr,channelData[curr.x - 2][curr.y],channelData[curr.x - 1][curr.y],channelData[curr.x - 1][curr.y + 1],channelData[curr.x - 2][curr.y + 1])
							continue
						}
					}
				}
				if(curr.y !== 0){
					if(curr.x + 1 === width){
					}
					else if(curr.y + 1 === height){
					}
					else{
						if(
							channelData[curr.x][curr.y] === channelData[curr.x][curr.y - 2]
							&& channelData[curr.x + 1][curr.y] === channelData[curr.x + 1][curr.y - 2]
							&& channelData[curr.x][curr.y + 1] === channelData[curr.x][curr.y - 1]
							&& channelData[curr.x + 1][curr.y + 1] === channelData[curr.x + 1][curr.y - 1]
						){
							writeSmallSymbol("TOP");
							write2x2directly(curr,channelData[curr.x][curr.y - 2],channelData[curr.x + 1][curr.y - 2],channelData[curr.x + 1][curr.y - 1],channelData[curr.x][curr.y - 1])
							continue
						}
					}
				}
				/*if(curr.x !== 0 && curr.y !== 0){
					if(curr.x + 1 === width){
					}
					else if(curr.y + 1 === height){
					}
					else{
						if(
							channelData[curr.x][curr.y] === Math.ceil((channelData[curr.x][curr.y - 2] + channelData[curr.x - 2][curr.y])/2)
							&& channelData[curr.x + 1][curr.y] === Math.ceil((channelData[curr.x + 1][curr.y - 2] + channelData[curr.x - 1][curr.y])/2)
							&& channelData[curr.x][curr.y + 1] === Math.ceil((channelData[curr.x][curr.y - 1] + channelData[curr.x - 2][curr.y + 1])/2)
							&& channelData[curr.x + 1][curr.y + 1] === Math.ceil((channelData[curr.x + 1][curr.y - 1] + channelData[curr.x - 1][curr.y + 1])/2)
						){
							writeSmallSymbol("AVERAGE");
							continue
						}
					}
				}*/
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[1][1]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSmallSymbol("whole");
					writeByte(chunck[0][0]);
					write2x2(curr,chunck[0][0],chunck[0][0],chunck[0][0],chunck[0][0]);
					continue;
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][1] === chunck[1][1]
				){
					writeSmallSymbol("vertical");
					writeByte(chunck[0][0]);
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1])
					if(table_ceiling > 2){
						writeByte(chunck[0][1])
					}
					continue;
				}
				if(
					chunck[0][0] === chunck[0][1]
					&& chunck[1][0] === chunck[1][1]
				){
					writeSmallSymbol("horizontal");
					writeByte(chunck[0][0]);
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1])
					if(table_ceiling > 2){
						writeByte(chunck[1][0])
					}
					continue;
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSmallSymbol("diagonal_solid_NW");
					writeByte(chunck[0][0]);
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1])
					if(table_ceiling > 2){
						writeByte(chunck[1][1])
					}
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[1][1]
				){
					writeSmallSymbol("diagonal_solid_NE");
					writeByte(chunck[0][0]);
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1])
					if(table_ceiling > 2){
						writeByte(chunck[0][1])
					}
					continue
				}
				if(
					chunck[0][1] === chunck[1][1]
					&& chunck[1][1] === chunck[1][0]
				){
					writeSmallSymbol("diagonal_solid_SE");
					writeByte(chunck[0][0]);
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1])
					if(table_ceiling > 2){
						writeByte(chunck[1][1])
					}
					continue
				}
				if(
					chunck[0][1] === chunck[1][1]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSmallSymbol("diagonal_solid_SW");
					writeByte(chunck[1][0]);
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1])
					if(table_ceiling > 2){
						writeByte(chunck[0][1])
					}
					continue
				}
				if(
					chunck[0][0] === chunck[1][1]
					&& chunck[0][1] === chunck[1][0]
				){
					writeSmallSymbol("cross");
					writeByte(chunck[0][0]);
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1])
					if(table_ceiling > 2){
						writeByte(chunck[0][1])
					}
					continue
				}
				try{
					writeSmallSymbol("pixels");
					write2x2(curr,chunck[0][0],chunck[1][0],chunck[1][1],chunck[0][1]);
					writeByte(chunck[0][0]);
					writeByte(chunck[1][0]);
					writeByte(chunck[1][1]);
					writeByte(chunck[0][1]);
				}
				catch(e){
					console.log(chunck)
					console.log(curr);
					console.log(currentEncode[curr.x][curr.y],currentEncode[curr.x + 1][curr.y],currentEncode[curr.x][curr.y + 1],currentEncode[curr.x + 1][curr.y + 1])
					console.log(channelData[curr.x][curr.y],channelData[curr.x + 1][curr.y],channelData[curr.x][curr.y + 1],channelData[curr.x + 1][curr.y + 1])
					console.log(table_ceiling);
					throw "found"
				}
			}
			else{
				throw "invalid block size"
			}
		}
		}
		}

		let encodeHuffTable = function(root,symbols){
			let bitArray = [];
			let blockLength = CHANNEL_LENGTH;
			if(symbols){
				blockLength = Math.ceil(Math.log2(symbols.length))
			}
			let traverse = function(huffNode){
				if(huffNode.isInternal){
					bitArray.push(1);
					traverse(huffNode.left);
					traverse(huffNode.right);
				}
				else{
					bitArray.push(0);
					if(symbols){
						rePlex(symbols.indexOf(huffNode.symbol),blockLength).forEach(bit => bitArray.push(bit))
					}
					else{
						rePlex(parseInt(huffNode.symbol),blockLength).forEach(bit => bitArray.push(bit))
					}
				}
			};
			traverse(root);
			return bitArray
		}

		let largeHuffman = createHuffman(largeSymbolFrequency);
		let largeSymbolBook = buildBook(largeHuffman);

		let smallHuffman = createHuffman(smallSymbolFrequency);
		let smallSymbolBook = buildBook(smallHuffman);
		if(CHANNEL_LENGTH > 1){
			if(occupied === CHANNEL_POWER){
				bitBuffer.push(0);
				bitBuffer.push(0);
			}
			else{
				if(CHANNEL_POWER < Math.min(delta_data.length,range_data.length)){
					bitBuffer.push(0);
					bitBuffer.push(1);
					console.log("using default encoding");
					bitBuffer = bitBuffer.concat(
						frequencyTable.map(ele => (ele ? 1 : 0))
					)
				}
				else if(delta_data.length < range_data.length){
					bitBuffer.push(1);
					bitBuffer.push(0);
					console.log("using delta encoding");
					bitBuffer = bitBuffer.concat(delta_data)
				}
				else{
					bitBuffer.push(1);
					bitBuffer.push(1);
					console.log("using range encoding");
					bitBuffer = bitBuffer.concat(range_data)
				}
			}
		}
		console.log("huff large",encodeHuffTable(largeHuffman,largeSymbolTable));
		console.log("huff small",encodeHuffTable(smallHuffman,smallSymbolTable));
		bitBuffer = bitBuffer.concat(encodeHuffTable(largeHuffman,largeSymbolTable));
		bitBuffer = bitBuffer.concat(encodeHuffTable(smallHuffman,smallSymbolTable));
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}

		let colourHuffman = createHuffman(integerFrequency);
		let colourBook = buildBook(colourHuffman);

		bitBuffer.push(0);
		console.log("huff cols",encodeHuffTable(colourHuffman));
		bitBuffer = bitBuffer.concat(encodeHuffTable(colourHuffman));

		let usage = integerFrequency.reduce((acc,val,index) => {
			if(val){
				return acc + val * colourBook[index].length
			}
			else{
				return acc
			}},0);

		let total_colourSymbols = integerFrequency.reduce((acc,val) => acc + val,0);
		let ideal_colour_entropy = -integerFrequency.reduce((acc,val) => {
			if(val){
				return acc + Math.log2(val/total_colourSymbols) * val/total_colourSymbols
			}
			else{
				return acc
			}
		},0) * total_colourSymbols

		let usage_l = Object.keys(largeSymbolFrequency).reduce((acc,val,index) => {
			if(largeSymbolFrequency[val]){
				return acc + largeSymbolFrequency[val] * largeSymbolBook[val].length
			}
			else{
				return acc
			}},0)

		let usage_s = Object.keys(smallSymbolFrequency).reduce((acc,val,index) => {
			if(smallSymbolFrequency[val]){
				return acc + smallSymbolFrequency[val] * smallSymbolBook[val].length
			}
			else{
				return acc
			}},0);

		let total_smallSymbols = Object.keys(smallSymbolFrequency).reduce((acc,val) => acc + smallSymbolFrequency[val],0);
		let ideal_small_entropy = -Object.keys(smallSymbolFrequency).reduce((acc,val) => {
			if(smallSymbolFrequency[val]){
				return acc + Math.log2(smallSymbolFrequency[val]/total_smallSymbols) * smallSymbolFrequency[val]/total_smallSymbols
			}
			else{
				return acc
			}
		},0) * total_smallSymbols

		let total_largeSymbols = Object.keys(largeSymbolFrequency).reduce((acc,val) => acc + largeSymbolFrequency[val],0);
		let ideal_large_entropy = -Object.keys(largeSymbolFrequency).reduce((acc,val) => {
			if(largeSymbolFrequency[val]){
				return acc + Math.log2(largeSymbolFrequency[val]/total_largeSymbols) * largeSymbolFrequency[val]/total_largeSymbols
			}
			else{
				return acc
			}
		},0) * total_largeSymbols

		console.log("  usage",usage,ideal_colour_entropy)

		console.log("  usage_l",usage_l,ideal_large_entropy)
		console.log("  usage_s",usage_s,ideal_small_entropy)
		console.log("  total usage",usage + usage_l + usage_s);

		console.log("i_freq",integerFrequency);
		console.log(options.name,"stats",stats);

		console.log("books",smallSymbolBook,largeSymbolBook,colourBook);

		aritmetic_queue.forEach(waiting => {
			try{
				if(isFinite(waiting)){
					bitBuffer.push(...colourBook[waiting])
				}
				else if(waiting.size === "large"){
					bitBuffer.push(...largeSymbolBook[waiting.symbol])
				}
				else{
					bitBuffer.push(...smallSymbolBook[waiting.symbol])
				}
			}
			catch(e){
				console.log(waiting);
				throw "up"
			}
			while(bitBuffer.length > 7){
				encodedData.push(dePlex(bitBuffer.splice(0,8)))
			}
		});
		if(options.quantizer === 0){
			for(let i=0;i<width;i++){
				for(let j=0;j<height;j++){
					if(currentEncode[i][j] !== channelData[i][j]){
						console.log(currentEncode[i][j],channelData[i][j],"i",i,"j",j);
						console.log("forbidden",forbidden[i][j])
						throw "bad encode"
					}
				}
			}
		}
		console.log("current encode",currentEncode,currentEncode.flat().sort((a,b) => a - b)[0],currentEncode.flat().sort((b,a) => a - b)[0]);
	}

	if(options.pixelFormat === "rgba"){
		if(options.target_pixelFormat === "yiq26a"){
			imageData = rgba_to_yiq26a(imageData)
		}
	}
	if(options.pixelFormat === "rgb"){
		if(options.target_pixelFormat === "yiq26"){
			imageData = rgb_to_yiq26(imageData)
		}
		else if(options.target_pixelFormat === "yiq26a"){
			imageData = add8bitAlpha(rgb_to_yiq26(imageData))
		}
	}

	if(!options.maxBlockSize){
		options.maxBlockSize = encoding_size
	}

	let channels = deMultiplexChannels(imageData,width,height);

	if(options.target_pixelFormat === "yiq26a"){
		encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[1],{
			bitDepth: 9,
			name: "I",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[2],{
			bitDepth: 9,
			name: "Q",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[3],{
			bitDepth: 8,
			name: "a",
			quantizer: 0,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
	}
	else if(options.target_pixelFormat === "yiq26"){
		encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[1],{
			bitDepth: 9,
			name: "I",
			quantizer: options.quantizer*1.5,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[2],{
			bitDepth: 9,
			name: "Q",
			quantizer: options.quantizer*1.5,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
	}
	else if(options.target_pixelFormat === "rgba"){
		encodeChannel(channels[0],{
			bitDepth: 8,
			name: "r",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[1],{
			bitDepth: 8,
			name: "g",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[2],{
			bitDepth: 8,
			name: "b",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
		encodeChannel(channels[3],{
			bitDepth: 8,
			name: "a",
			quantizer: 0,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
	}
	else if(options.target_pixelFormat === "greyscale"){
		encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
	}
	else if(options.target_pixelFormat === "bit"){
		encodeChannel(channels[0],{
			bitDepth: 1,
			name: "bitmap",
			quantizer: 0,
			force: false,
			useDCT: options.useDCT,
			maxBlockSize: options.maxBlockSize
		})
	}


	if(bitBuffer.length){
		while(bitBuffer.length < 8){
			bitBuffer.push(0)
		}
		encodedData.push(dePlex(bitBuffer.splice(0,8)))
	}

	return Uint8Array.from(encodedData)
}

function decoder(hohData,options){
	if(!options){
		return{
			imageData: null,
			error: "usage: decoder(hohData,options)"
		}
	}
	if(!options.pixelFormat){
		return{
			imageData: null,
			error: "a pixelFormat is required. Use decoder(hohData,{pixelFormat: 'rgba'}} if unsure"
		}
	}
	if(!["rgba","yiq26a"].includes(options.pixelFormat)){
		return{
			imageData: null,
			error: "only rgba or yiq26a supported for pixelFormat"
		}
	}
	if(hohData.length < 8){
		return{
			imageData: null,
			error: "data does not contain required header"
		}
	}
	let currentIndex = 1;
	let bitBuffer = rePlex(hohData[0]);
	let readByteNative = function(){
		if(currentIndex < hohData.length){
			bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
		}
		else if(bifBuffer.length < BYTE_LENGTH){
			throw "unexpeced end of file"
		}
		return dePlex(bitBuffer.splice(0,BYTE_LENGTH))
	}
	let readBit = function(){
		if(bitBuffer.length === 0){
			if(currentIndex < hohData.length){
				bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
			}
			else{
				throw "unexpeced end of file"
			}
		}
		return bitBuffer.splice(0,1)[0]
	}
	if(!(readByteNative() === 72 && readByteNative() === 79 && readByteNative() === 72 && readByteNative() === 0)){
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
				bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
			}
			buffer = buffer.concat(bitBuffer.splice(0,BYTE_LENGTH - 1))
		}
		if(bitBuffer.length < (BYTE_LENGTH - 1)){
			bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
		}
		buffer = buffer.concat(bitBuffer.splice(0,BYTE_LENGTH - 1));
		return dePlex(buffer);
	}
	const width = readVarint(BYTE_LENGTH);
	const height = readVarint(BYTE_LENGTH);

	const encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));

	let pixelFormat = internal_formats[readByteNative()];

	console.log(width,height,pixelFormat);

	let frames = readVarint(BYTE_LENGTH);
	if(frames !== 0){
		throw "animation decoding not supported"
	}

	let channels = [];

	let botchedFlag = false;

	let decodeChannel = function(options){
		const CHANNEL_LENGTH = options.bitDepth;
		const CHANNEL_POWER = Math.pow(2,CHANNEL_LENGTH);
		const CHANNEL_MAX_VAL = CHANNEL_POWER - 1;

		const PRIMITIVE = primitive_huffman(CHANNEL_POWER);

		let readDelta = function(){
			let head = PRIMITIVE;
			while(head.isInternal){
				if(readBit()){
					head = head.right
				}
				else{
					head = head.left
				}
			}
			return head.symbol
		}

		let decodeHuffTable = function(symbols){
			let blockLength = CHANNEL_LENGTH;
			if(symbols){
				blockLength = Math.ceil(Math.log2(symbols.length))
			}
			let readNode = function(){
				let isInternal = readBit();
				if(isInternal){
					return {
						isInternal: true,
						left: readNode(),
						right: readNode()
					}
				}
				else{
					let matissa = [];
					for(let i=0;i<blockLength;i++){
						matissa.push(readBit())
					}
					if(symbols){
						return {
							isInternal: false,
							symbol: symbols[dePlex(matissa)]
						}
					}
					else{
						return {
							isInternal: false,
							symbol: dePlex(matissa)
						}
					}
				}
			}
			return readNode()
		}

		let channelData = [];
		let currentEncode = [];
		for(let i=0;i<width;i++){
			channelData.push(new Array(height).fill(0));
			currentEncode.push(new Array(height).fill(0))
		}
		let translationTable = [];
		try{
			let flagBit1 = readBit();
			let flagBit2 = readBit();
			console.log(flagBit1,flagBit2);

			if(flagBit1 === 1 && flagBit2 === 1){
				console.log("detected range encoding");
				while(bitBuffer.length < (CHANNEL_LENGTH - 1) && currentIndex < hohData.length){
					bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
				}
				let ranges = dePlex(bitBuffer.splice(0,CHANNEL_LENGTH - 1));
				let deltas = [];
				for(let i=0;i<ranges*2;i++){
					deltas.push(parseInt(readDelta()) + 1)
				};
				let colourAllowable;
				let rangeActive = false;
				deltas.forEach((delta,index) => {
					if(index === 0){
						colourAllowable = new Array(delta - 1).fill(rangeActive)
					}
					else{
						colourAllowable = colourAllowable.concat(new Array(delta).fill(rangeActive))
					}
					rangeActive = !rangeActive
				});
				colourAllowable.forEach((val,index) => {
					if(val){
						translationTable.push(index)
					}
				})
			}
			else if(flagBit1 === 1 && flagBit2 === 0){
				while(bitBuffer.length < CHANNEL_LENGTH && currentIndex < hohData.length){
					bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
				}
				let occupied = dePlex(bitBuffer.splice(0,CHANNEL_LENGTH));
				let deltas = [];
				for(let i=0;i<occupied;i++){
					deltas.push(parseInt(readDelta()) + 1)
				};
				let colourAllowable = [];
				deltas.forEach((delta,index) => {
					colourAllowable = colourAllowable.concat(new Array(delta - 1).fill(false))
					colourAllowable.push(true)
				});
				colourAllowable.forEach((val,index) => {
					if(val){
						translationTable.push(index)
					}
				})
			}
			else if(flagBit1 === 0 && flagBit2 === 0){
				for(let i=0;i<CHANNEL_POWER;i++){
					translationTable.push(i)
				}
			}
			else{
				throw "here we go again"
			}
		}
		catch(e){
			console.log("error in tables");
			console.log(e);
			botchedFlag = true;
			return channelData
		}
		try{
			let table_ceiling = translationTable.length;
			console.log("d table ceiling",table_ceiling);
			let colourHuffman;
			let largeHuffman = decodeHuffTable(largeSymbolTable);
			let smallHuffman = decodeHuffTable(smallSymbolTable);
			let colourMethod = readBit();
			if(colourMethod === 0){
				colourHuffman = decodeHuffTable()
			}
			else{
				throw "only huffman colour method supported"
			}

			let readLargeSymbol = function(){
				let head = largeHuffman;
				while(head.isInternal){
					if(readBit()){
						head = head.right
					}
					else{
						head = head.left
					}
				}
				return head.symbol
			}

			let readSmallSymbol = function(){
				let head = smallHuffman;
				while(head.isInternal){
					if(readBit()){
						head = head.right
					}
					else{
						head = head.left
					}
				}
				return head.symbol
			}

			let readColour = function(){
				let head = colourHuffman;
				while(head.isInternal){
					if(readBit()){
						head = head.right
					}
					else{
						head = head.left
					}
				}
				return parseInt(head.symbol)
			}


			let forbidden = [];
			for(let i=0;i<width;i++){
				forbidden.push(new Array(height).fill(false))
			}

			let write2x2 = function(curr,a,b,c,d){
				if(curr.x + 1 < width){
					if(curr.y + 1 < height){
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
						currentEncode[curr.x + 1][curr.y] = (currentEncode[curr.x + 1][curr.y] + b) % table_ceiling;
						currentEncode[curr.x + 1][curr.y + 1] = (currentEncode[curr.x + 1][curr.y + 1] + c) % table_ceiling;
						currentEncode[curr.x][curr.y + 1] = (currentEncode[curr.x][curr.y + 1] + d) % table_ceiling;
					}
					else{
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
						currentEncode[curr.x + 1][curr.y] = (currentEncode[curr.x + 1][curr.y] + b) % table_ceiling;
					}
				}
				else{
					if(curr.y + 1 < height){
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
						currentEncode[curr.x][curr.y + 1] = (currentEncode[curr.x][curr.y + 1] + d) % table_ceiling;
					}
					else{
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
					}
				}
			}

			for(let size = encoding_size; size > 1;size = size/2){
			for(let x = 0;x < width;x += size){
			for(let y = 0;y < height;y += size){
				let curr = {x: x,y: y,size: size};
				if(forbidden[x][y]){
					continue
				}
				if(curr.size > 2){
					let symbol = readLargeSymbol();
					if(curr.x === 368 && curr.y === 412 && curr.size === 4){
						console.log(symbol)
					}
					if(symbol === "divide"){
						//foo
					}
					else if(symbol === "STOP"){
						for(let i=0;i<curr.size;i++){
							for(let j=0;j<curr.size;j++){
								if((curr.x + i) < width && (curr.y + j) < height){
									forbidden[curr.x + i][curr.y + j] = true
								}
							}
						}
					}
					else if(symbol === "whole"){
						let colour = readColour();
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + colour) % table_ceiling;
							}
						}
					}
					else if(symbol === "PREVIOUS"){
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = currentEncode[i - curr.size][j]
							}
						}
					}
					else if(symbol === "TOP"){
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = currentEncode[i][j - curr.size]
							}
						}
					}
					else if(symbol === "TOPLEFT"){
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = currentEncode[i - curr.size][j - curr.size]
								if(currentEncode[i][j] < 0){
									console.log("topleft!")
									throw "tantrum"
								}
							}
						}
					}
					else if(symbol === "TOPRIGHT"){
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = currentEncode[i + curr.size][j - curr.size]
							}
						}
					}
					else if(symbol === "vertical"){
						let top = readColour();
						let bottom = readColour();
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(top + (bottom - top) * (j - curr.y) /(curr.size - 1))) % table_ceiling
							}
						}
					}
					else if(symbol === "vertical_i"){
						let top = readColour();
						let bottom = readColour();
						if(bottom > top){
							bottom -= table_ceiling
						}
						else{
							top -= table_ceiling
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(top + (bottom - top) * (j - curr.y) /(curr.size - 1)) + table_ceiling) % table_ceiling
							}
						}
					}
					else if(symbol === "horizontal"){
						let left = readColour();
						let right = readColour();
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(left + (right - left) * (i - curr.x) /(curr.size - 1))) % table_ceiling
							}
						}
					}
					else if(symbol === "horizontal_i"){
						let left = readColour();
						let right = readColour();
						if(right > left){
							right -= table_ceiling
						}
						else{
							left -= table_ceiling
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(left + (right - left) * (i - curr.x) /(curr.size - 1)) + table_ceiling) % table_ceiling
							}
						}
					}
					else if(symbol === "diagonal_NW"){
						let colour1 = readColour();
						let colour2 = readColour();
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(colour1 + (colour2 - colour1) * ((i - curr.x) + (j - curr.y))/(2*curr.size - 2))) % table_ceiling
							}
						}
					}
					else if(symbol === "diagonal_NW_i"){
						let colour1 = readColour();
						let colour2 = readColour();
						if(colour2 > colour1){
							colour2 -= table_ceiling
						}
						else{
							colour1 -= table_ceiling
						}
						if(curr.x === 368 && curr.y === 412 && curr.size === 4){
							console.log(symbol,colour1,colour2,currentEncode[curr.x][curr.y] + 0)
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(colour1 + (colour2 - colour1) * ((i - curr.x) + (j - curr.y))/(2*curr.size - 2)) + table_ceiling) % table_ceiling
							}
						}
					}
					else if(symbol === "diagonal_NE"){
						let colour1 = readColour();
						let colour2 = readColour();
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(colour1 + (colour2 - colour1) * ((curr.size - (i - curr.x) - 1) + (j - curr.y))/(2*curr.size - 2))) % table_ceiling
							}
						}
					}
					else if(symbol === "diagonal_NE_i"){
						let colour1 = readColour();
						let colour2 = readColour();
						if(colour2 > colour1){
							colour2 -= table_ceiling
						}
						else{
							colour1 -= table_ceiling
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + Math.round(colour1 + (colour2 - colour1) * ((curr.size - (i - curr.x) - 1) + (j - curr.y))/(2*curr.size - 2)) + table_ceiling) % table_ceiling
							}
						}
					}
					else if(symbol === "diagonal_solid_NW"){
						let colour1 = readColour();
						let colour2 = readColour();
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								if(
									i + j - curr.x - curr.y < curr.size
								){
									currentEncode[i][j] = (currentEncode[i][j] + colour1) % table_ceiling
								}
								else{
									currentEncode[i][j] = (currentEncode[i][j] + colour2) % table_ceiling
								}
							}
						}
					}
					else if(symbol === "diagonal_solid_NE"){
						let colour1 = readColour();
						let colour2 = readColour();
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								if(
									(curr.size - (i - curr.x) - 1) + j - curr.y < curr.size
								){
									currentEncode[i][j] = (currentEncode[i][j] + colour1) % table_ceiling
								}
								else{
									currentEncode[i][j] = (currentEncode[i][j] + colour2) % table_ceiling
								}
							}
						}
					}
					else if(symbol === "steep_NW"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_odd_solid(colour1,colour2,false,true,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "steep_NE"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_odd_solid(colour1,colour2,true,true,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "calm_NW"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_odd_solid(colour1,colour2,false,false,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "calm_NE"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_odd_solid(colour1,colour2,true,false,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "horizontal_third"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_third(colour1,colour2,false,false,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "horizontal_large_third"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_third(colour1,colour2,false,true,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "vertical_third"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_third(colour1,colour2,true,false,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "vertical_large_third"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_third(colour1,colour2,true,true,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "dip_NW"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_dip(colour1,colour2,false,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y] + table_ceiling) % table_ceiling
							}
						}
					}
					else if(symbol === "dip_NW_i"){
						let colour1 = readColour();
						let colour2 = readColour();
						if(colour2 > colour1){
							colour2 -= table_ceiling
						}
						else{
							colour1 -= table_ceiling
						}
						let patch = create_dip(colour1,colour2,false,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y] + table_ceiling) % table_ceiling
							}
						}
					}
					else if(symbol === "dip_NE"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_dip(colour1,colour2,true,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else if(symbol === "dip_NE_i"){
						let colour1 = readColour();
						let colour2 = readColour();
						if(colour2 > colour1){
							colour2 -= table_ceiling
						}
						else{
							colour1 -= table_ceiling
						}
						let patch = create_dip(colour1,colour2,true,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y] + table_ceiling) % table_ceiling
							}
						}
					}
					else if(symbol.substring(0,3) === "dct"){
						let colour1 = readColour();
						let colour2 = readColour();
						let patch = create_dct(colour1,colour2,parseInt(symbol[3]),parseInt(symbol[4]),curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = (currentEncode[i][j] + patch[i - curr.x][j - curr.y]) % table_ceiling
							}
						}
					}
					else{
						throw "unknown symbol: " + symbol
					}
				}
				else{
					let instruction = readSmallSymbol();
					if(instruction === "STOP"){
						//foo
					}
					else if(instruction === "PREVIOUS"){
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = currentEncode[i - curr.size][j]
							}
						}
					}
					else if(instruction === "TOP"){
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = currentEncode[i][j - curr.size]
							}
						}
					}
					else if(instruction === "pixels"){
						write2x2(curr,readColour(),readColour(),readColour(),readColour())
					}
					else if(instruction === "whole"){
						let colour = readColour();
						write2x2(curr,colour,colour,colour,colour)
					}
					else if(instruction === "vertical"){
						let topColour = readColour();
						let bottomColour = readColour();
						write2x2(curr,topColour,topColour,bottomColour,bottomColour)
					}
					else if(instruction === "horizontal"){
						let leftColour = readColour();
						let rightColour = readColour();
						write2x2(curr,leftColour,rightColour,rightColour,leftColour)
					}
					else if(instruction === "diagonal_solid_NW"){
						let a = readColour();
						let b = readColour();
						write2x2(curr,a,a,b,a)
					}
					else if(instruction === "diagonal_solid_NE"){
						let a = readColour();
						let b = readColour();
						write2x2(curr,a,a,a,b)
					}
					else if(instruction === "diagonal_solid_SE"){
						let a = readColour();
						let b = readColour();
						write2x2(curr,a,b,b,b)
					}
					else if(instruction === "diagonal_solid_SW"){
						let a = readColour();
						let b = readColour();
						write2x2(curr,b,a,b,b)
					}
					else if(instruction === "diagonal_solid_SW"){
						let a = readColour();
						let b = readColour();
						write2x2(curr,b,a,b,b)
					}
					else if(instruction === "cross"){
						let a = readColour();
						let b = readColour();
						write2x2(curr,a,b,a,b)
					}
					else{
						throw "unknown symbol: " + instruction
					}
				}
			}}}
		}
		catch(e){
			console.log(e);
			for(let i=0;i<width;i++){
				for(let j=0;j<height;j++){
					channelData[i][j] = translationTable[currentEncode[i][j]]
				}
			}
			botchedFlag = true;
			return channelData
		}
		for(let i=0;i<width;i++){
			for(let j=0;j<height;j++){
				channelData[i][j] = translationTable[currentEncode[i][j]]
			}
		}
		return channelData
	}
	if(pixelFormat === "greyscale"){
		channels.push(decodeChannel({bitDepth: 8}));
		let rawData = multiplexChannels(channels);
		return {
			imageData: rgb_to_rgba(greyscale_to_rgb(rawData)),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "yiq26"){
		channels.push(decodeChannel({bitDepth: 8}));
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 9}))
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 9}))
		}
		let rawData = multiplexChannels(channels);
		return {
			imageData: rgb_to_rgba(yiq26_to_rgb(rawData)),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "yiq26a"){
		channels.push(decodeChannel({bitDepth: 8}));
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 9}))
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 9}))
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(255))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 8}))
		}
		let rawData = multiplexChannels(channels);
		return {
			imageData: rgb_to_rgba(yiq26_to_rgb(rawData)),
			width: width,
			height: height
		}
	}
	else{
		throw "only certain decoding modes supported so far"
	}
}






