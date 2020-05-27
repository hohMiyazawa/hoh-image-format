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
		outBuffer[i + 1] = Co + BYTE_MAX_VAL;
		outBuffer[i + 2] = Cg + BYTE_MAX_VAL;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function yiq26a_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let Y = imageData[i];
		let Co = imageData[i + 1] - BYTE_MAX_VAL;
		let Cg = imageData[i + 2] - BYTE_MAX_VAL;
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
	for(let i=0;i<width;i++){
		for(let j=0;j<height;j++){
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

function numberOfCombinations(channel1,channel2){
	let combs = [];
	for(let i=0;i<256;i++){
		combs.push(new Array(512).fill(0))
	}
	for(let i=0;i<channel1.length;i++){
		for(let j=0;j<channel1[0].length;j++){
			combs[channel1[i][j]][channel2[i][j]]++;
		}
	}
	console.log("Y - I",combs.flat().filter(a => a),combs.map(chroma => chroma.filter(a => a).length),combs.map(chroma => -chroma.findIndex(a => a) + (512 - chroma.reverse().findIndex(a => a))));
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

let base_freq_256 = [];
let start = 10000;
for(let i=0;i<256;i++){
	base_freq_256.push(start);
	start = Math.round(start*9/10);
}

let base_freq_512 = [];
start = 10000;
for(let i=0;i<512;i++){
	base_freq_512.push(start);
	start = Math.round(start*19/20);
}

const PRIMITIVE_256 = buildBook(createHuffman(base_freq_256));
const PRIMITIVE_512 = buildBook(createHuffman(base_freq_512));

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
	"diagonal_NW",
	"diagonal_NE",
	"diagonal_solid_NW",
	"diagonal_solid_NE",
	"diagonal_solid_SW",
	"diagonal_solid_SE",
	"cross"
]

const largeSymbolTable = [
	"divide",
	"whole",
	"STOP",
	"vertical",
	"horizontal",
	"diagonal_NW",
	"diagonal_NE",
	"diagonal_solid_NW",
	"diagonal_solid_NE",
	"steep_NW",
	"steep_NE",
	"calm_NW",
	"calm_NE",
	"dip_NW",
	"dip_NE",
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
	"dct23"
]

function encoder(imageData,options){
	console.info("ENCODING");
	const width = options.width;
	const height = options.height;
	const encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));
	if(!["rgba","yiq26a"].includes(options.pixelFormat)){
		throw "only rgba or yiq26a supported"
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
	writeByteNative(3);//YIQ26
	bitBuffer.push(...encodeVarint(0,BYTE_LENGTH));//still image
//end write header
	
	if(options.pixelFormat === "rgba"){
		imageData = rgba_to_yiq26a(imageData)
	}


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
			s_diagonal_NW: 0,
			s_diagonal_NE: 0,
			s_diagonal_solid_NW: 0,
			s_diagonal_solid_NE: 0,
			s_diagonal_solid_SW: 0,
			s_diagonal_solid_SE: 0,
			s_cross: 0,
			s_STOP: 0,
			STOP: 0,
			divide: 0,
			whole: 0,
			vertical: 0,
			horizontal: 0,
			diagonal_NW: 0,
			diagonal_NE: 0,
			diagonal_solid_NW: 0,
			diagonal_solid_NE: 0,
			steep_NW: 0,
			steep_NE: 0,
			calm_NW: 0,
			calm_NE: 0,
			dip_NW: 0,
			dip_NE: 0,
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
			dct23: 0
		}

//tables
		let frequencyTable = new Array(CHANNEL_POWER).fill(0);
		for(let i=0;i<channelData.length;i++){
			for(let j=0;j<channelData[0].length;j++){
				frequencyTable[channelData[i][j]]++;
			}
		};
		let occupied = frequencyTable.filter(a => a).length;
		console.log(options.name,Math.round(100*occupied/frequencyTable.length) + "%",frequencyTable);
		console.log(options.name,"raw table size",CHANNEL_POWER);
		let delta_data = rePlex(occupied,CHANNEL_LENGTH);
		let delta = 0;
		for(let i=0;i<CHANNEL_POWER;i++){
			delta++;
			if(frequencyTable[i]){
				if(CHANNEL_LENGTH === 8){
					delta_data = delta_data.concat(PRIMITIVE_256[delta - 1]);
					delta = 0
				}
				else if(CHANNEL_LENGTH === 9){
					delta_data = delta_data.concat(PRIMITIVE_512[delta - 1]);
					delta = 0
				}
				else{
					throw "no delta support in colour table"
				}
			}
		}
		console.log(options.name,"delta table size",delta_data.length);
		let listing_data = rePlex(occupied,CHANNEL_LENGTH);
		for(let i=0;i<CHANNEL_POWER;i++){
			if(frequencyTable[i]){
				listing_data = listing_data.concat(rePlex(i,CHANNEL_LENGTH))
			}
		}
		console.log(options.name,"list table size",listing_data.length);
		let range_data = [];
		let rangeActive = false;
		delta = 0;
		let shift_counter = 0;
		for(let i=0;i<CHANNEL_POWER;i++){
			delta++;
			if(
				(frequencyTable[i] && rangeActive === false)
				|| (!frequencyTable[i] && rangeActive === true)
			){
				rangeActive = !rangeActive;
				shift_counter++;
				if(CHANNEL_LENGTH === 8){
					range_data = range_data.concat(PRIMITIVE_256[delta - 1]);
					delta = 0
				}
				else if(CHANNEL_LENGTH === 9){
					range_data = range_data.concat(PRIMITIVE_512[delta - 1]);
					delta = 0
				}
				else{
					throw "no delta support in colour table"
				}
			}
		}
		if(rangeActive){
			range_data = range_data.concat(PRIMITIVE_256[0])
			shift_counter++
		}
		range_data = rePlex(shift_counter/2,CHANNEL_LENGTH - 1).concat(range_data);
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
		const table_ceiling = delta;
		console.log("table_ceiling",table_ceiling);

		for(let i=0;i<channelData.length;i++){
			for(let j=0;j<channelData[0].length;j++){
				channelData[i][j] = translationTable[channelData[i][j]]
			}
		}
		
		let currentEncode = [];
		for(let i=0;i<channelData.length;i++){
			currentEncode.push(new Array(height).fill(0))
		}

//end tables

		let error_compare = function(chunck1,chunck2,offx,offy){
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

		let forige = 0;
		let writeByte = function(integer){
			if(integer !== Math.round(integer)){
				throw "fractional"
			}
			//let encodedInteger = integer - forige;
			let encodedInteger = integer;
			forige = integer;
			if(encodedInteger < 0){
				encodedInteger += table_ceiling
			}
			if(encodedInteger < 0){
				console.log(integer,table_ceiling);
				throw "bad";
			}
			aritmetic_queue.push(encodedInteger);
			integerFrequency[encodedInteger]++
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

		let sharpener = function(a,b,chuncker,resolver,symbol){
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
				error: error,
				colours: [a,b],
				patch: patch
			}
		}

		let blockQueue = [{x: 0,y:0, size: encoding_size}];

		while(blockQueue.length){
			let curr = blockQueue.pop();
			if(
				curr.x >= width
				|| curr.y >= height
			){
				continue
			}
			let chunck = get_chunck(curr.x,curr.y,curr.size);
			let perfect = chunck.flat().filter(a => a).length === 0;
			if(curr.size > 200){
				//console.log(curr.size,chunck.flat().map(a => a).length,JSON.parse(JSON.stringify(chunck)))
			}
			if(curr.size >= 4){
				if(perfect){
					writeLargeSymbol("STOP");
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
					/*console.log("err",curr.size,error_compare(flate,chunck,curr.x,curr.y));
					console.log("err_v",curr.size,error_compare(vertical_gradient,chunck,curr.x,curr.y));
					console.log("marr",mArr,curr.size);
					console.log("average",average);
					console.log("c1c2",Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[3])/4),Math.round((mArr[12] + mArr[13] + mArr[14] +mArr[15])/4));*/
					//console.log("avg",curr.size,average)
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
					"vertical"
				))
				errorQueue.push(sharpener(
					left,
					right,
					(a,b) => create_horizontal_gradient(a,b,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"horizontal"
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
					NW_s,
					SE_s,
					(a,b) => create_diagonal_solid(a,b,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_solid_NW"
				))
				errorQueue.push(sharpener(
					NE_s,
					SW_s,
					(a,b) => create_diagonal_solid(a,b,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"diagonal_solid_NE"
				))

				errorQueue.push(sharpener(
					steep_NW,
					steep_SE,
					(a,b) => create_odd_solid(a,b,false,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"steep_NW"
				))

				errorQueue.push(sharpener(
					calm_NW,
					calm_SE,
					(a,b) => create_odd_solid(a,b,false,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"calm_NW"
				))

				errorQueue.push(sharpener(
					steep_NE,
					steep_SW,
					(a,b) => create_odd_solid(a,b,true,true,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
					"steep_NE"
				))

				errorQueue.push(sharpener(
					calm_NE,
					calm_SW,
					(a,b) => create_odd_solid(a,b,true,false,curr.size),
					patch => error_compare(chunck,patch,curr.x,curr.y),
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

				/*let selected_patch;
				if(whole_error < 2*Math.min(vertical_error,horizontal_error)){
					selected_patch = flate;
					writeLargeSymbol("whole");
					writeByte(average);
				}
				else{
					if(vertical_error < horizontal_error){
						selected_patch = vertical_gradient;
						writeLargeSymbol("vertical");
						writeByte(top);
						writeByte(bottom);
					}
					else{
						selected_patch = horizontal_gradient;
						writeLargeSymbol("horizontal");
						writeByte(left);
						writeByte(right);
					}
				}*/

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
				blockQueue.push({
					x: curr.x,
					y: curr.y,
					size: curr.size/2
				})
				blockQueue.push({
					x: curr.x + curr.size/2,
					y: curr.y,
					size: curr.size/2
				})
				blockQueue.push({
					x: curr.x + curr.size/2,
					y: curr.y + curr.size/2,
					size: curr.size/2
				})
				blockQueue.push({
					x: curr.x,
					y: curr.y + curr.size/2,
					size: curr.size/2
				})
			}
			else if(curr.size >= 2){
				if(perfect){
					writeSmallSymbol("STOP");
					continue;
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[1][1]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSmallSymbol("whole");
					writeByte(chunck[0][0]);
					continue;
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][1] === chunck[1][1]
				){
					writeSmallSymbol("vertical");
					writeByte(chunck[0][0]);
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
					if(table_ceiling > 2){
						writeByte(chunck[1][0])
					}
					continue;
				}
				let dia1_err = error_compare(create_diagonal_gradient(chunck[0][0],chunck[1][1],false,2),chunck,0,0);
				if(dia1_err === 0){
					writeSmallSymbol("diagonal_NW");
					writeByte(chunck[0][0]);
					if(table_ceiling > 2){
						writeByte(chunck[1][1])
					}
					continue
				}
				let dia2_err = error_compare(create_diagonal_gradient(chunck[1][0],chunck[0][1],true,2),chunck,0,0);
				if(dia2_err === 0){
					writeSmallSymbol("diagonal_NE");
					writeByte(chunck[1][0]);
					if(table_ceiling > 2){
						writeByte(chunck[0][1])
					}
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSmallSymbol("diagonal_solid_NW");
					writeByte(chunck[0][0]);
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
					if(table_ceiling > 2){
						writeByte(chunck[0][1])
					}
					continue
				}
				try{
					writeSmallSymbol("pixels");
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

		if(CHANNEL_POWER < Math.min(delta_data,range_data)){
			bitBuffer.push(0);
			bitBuffer.push(1);
			bitBuffer = bitBuffer.concat(
				frequencyTable.map(ele => (ele ? 1 : 0))
			)
		}
		else if(delta_data < range_data){
			bitBuffer.push(1);
			bitBuffer.push(0);
			bitBuffer = bitBuffer.concat(delta_data)
		}
		else{
			bitBuffer.push(1);
			bitBuffer.push(1);
			bitBuffer = bitBuffer.concat(range_data)
		}
		bitBuffer = bitBuffer.concat(encodeHuffTable(largeHuffman,largeSymbolTable));
		bitBuffer = bitBuffer.concat(encodeHuffTable(smallHuffman,smallSymbolTable));
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}

		let colourHuffman = createHuffman(integerFrequency);
		let colourBook = buildBook(colourHuffman);

		bitBuffer = bitBuffer.concat(encodeHuffTable(colourHuffman));

		let usage = integerFrequency.reduce((acc,val,index) => {
			if(val){
				return acc + val * colourBook[index].length
			}
			else{
				return acc
			}},0);

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
			}},0)

		console.log("  usage",usage)

		console.log("  usage_l",usage_l)
		console.log("  usage_s",usage_s)
		console.log("  total usage",usage + usage_l + usage_s);

		console.log("i_freq",integerFrequency,translationTable);
		console.log(options.name,"stats",stats);

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
		})
		
	}
	let channels = deMultiplexChannels(imageData,width,height);
	encodeChannel(channels[0],{
		bitDepth: 8,
		name: "Y",
		quantizer: 0,
		force: false,
		useDCT: true
	})
	/*encodeChannel(channels[1],{
		bitDepth: 9,
		name: "I",
		quantizer: 0
	})
	encodeChannel(channels[2],{
		bitDepth: 9,
		name: "Q",
		quantizer: 0
	})
	encodeChannel(channels[3],{
		bitDepth: 8,
		name: "a",
		quantizer: 0
	})*/

	//numberOfCombinations(channels[0],channels[1])

	return encodedData
}






