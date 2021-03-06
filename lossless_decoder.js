importScripts("arith.js");
importScripts("colourspace.js");
importScripts("bitimage.js");

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

let decodeChannel_lossless = function(data,channel_options,global_options,context_data){
	console.info("Decoding",channel_options.name);
	const width = channel_options.width;
	const height = channel_options.height;
	let range = channel_options.range;

	//console.log("first bytes of stream",data[0],data[1],data[2]);

	let currentIndex = 1;
	let bitBuffer = rePlex(data[0]);
	let readBit = function(){
		if(bitBuffer.length === 0){
			if(currentIndex < data.length){
				bitBuffer = bitBuffer.concat(rePlex(data[currentIndex++]))
			}
			else{
				throw "unexpeced end of data"
			}
		}
		return bitBuffer.splice(0,1)[0]
	}

	let debug_reads = 0;
	let reader = {
		read: function(){
			debug_reads++;
			if(debug_reads <= channel_options.bitLength){
				return readBit()
			}
			else{
				return -1
			}
		},
		close: function(){}
	}

	let decodedData = [];

	let predictors = [
		{
			name: "previous",
			predict: function(index){
				if(index % width){
					return decodedData[index - 1]
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "top",
			predict: function(index){
				if(index >= width){
					return decodedData[index - width]
				}
				else if(index % width){
					return decodedData[index - 1]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average",
			predict: function(index){
				if(index % width){
					if(index >= width){
						return Math.floor((decodedData[index - 1] + decodedData[index - width])/2)
					}
					else{
						return decodedData[index - 1]
					}
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_L-TL",
			predict: function(index){
				if(index % width){
					if(index >= width){
						return Math.floor((decodedData[index - 1] + decodedData[index - width - 1])/2)
					}
					else{
						return decodedData[index - 1]
					}
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T-TL",
			predict: function(index){
				if(index % width){
					if(index >= width){
						return Math.floor((decodedData[index - width] + decodedData[index - width - 1])/2)
					}
					else{
						return decodedData[index - 1]
					}
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T-TR",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return Math.floor((decodedData[index - width] + decodedData[index - width + 1])/2)
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_(L-TR)-T",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width && index % width){
					return Math.floor((Math.floor((decodedData[index - 1] + decodedData[index - width + 1])/2) + decodedData[index - width])/2)
				}
				return 0
			},
			count: 0
		},
		{
			name: "paeth",
			predict: function(index){
				if(index % width && index >= width){
					let A = decodedData[index - 1];
					let B = decodedData[index - width];
					let C = decodedData[index - width - 1];
					let p = A + B - C;
					let Ap = Math.abs(A - p);
					let Bp = Math.abs(B - p);
					let Cp = Math.abs(C - p);
					let mini = Math.min(Ap,Bp,Cp);
					if(mini === Ap){
						return A
					}
					else if(mini === Bp){
						return B
					}
					else{
						return C
					}
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				else if(index % width){
					return decodedData[index - 1]
				}
				return 0
			},
			count: 0
		},
		{
			name: "top_left",
			predict: function(index){
				if(index % width && index >= width){
					return decodedData[index - width - 1];
				}
				else if(index % width){
					return decodedData[index - 1]
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "top_right",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return decodedData[index - width + 1];
				}
				else if(index >= width){
					return decodedData[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_L_L-TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((decodedData[index - 1]*2 + decodedData[index - width - 1])/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_L-TL_TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((decodedData[index - 1] + decodedData[index - width - 1]*2)/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T-TL_TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((decodedData[index - width] + decodedData[index - width - 1]*2)/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T_T-TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((decodedData[index - width]*2 + decodedData[index - width - 1])/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T_T-TR",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return Math.floor((decodedData[index - width]*2 + decodedData[index - width + 1])/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T-TR_TR",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return Math.floor((decodedData[index - width] + decodedData[index - width + 1]*2)/3)
				}
				return 0
			},
			count: 0
		}
	];

	let translationTable = [];
	let index_colour = null;
	if(reader.read()){
		let indexLength = dePlex(new Array(8).fill(0).map(_ => reader.read()));
		index_colour = [];
		for(let i=0;i<indexLength;i++){
			index_colour.push([
				dePlex(new Array(8).fill(0).map(_ => reader.read())),
				dePlex(new Array(8).fill(0).map(_ => reader.read())),
				dePlex(new Array(8).fill(0).map(_ => reader.read()))
			])
		}
		range = indexLength
	}
	else{

		const PRIMITIVE = primitive_huffman(range);

		let readDelta = function(){
			let head = PRIMITIVE;
			while(head.isInternal){
				if(reader.read()){
					head = head.right
				}
				else{
					head = head.left
				}
			}
			return head.symbol
		}

		let bit1 = reader.read();
		let bit2 = reader.read();
		if(bit1 === 0 && bit2 === 0){
			translationTable = new Array(range).fill(0).map((_,index) => index);
		}
		else if(bit1 === 0 && bit2 === 1){
			let occupied = dePlex(new Array(Math.ceil(Math.log2(range))).fill(0).map(_ => reader.read()));

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
			range = translationTable.length;
		}
		else if(bit1 === 1 && bit2 === 0){
			let ranges = dePlex(new Array(Math.ceil(Math.log2(range)) - 1).fill(0).map(_ => reader.read()));
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
			range = translationTable.length;
		}
		else{
			translationTable = [];
			for(let i=0;i<range;i++){
				if(reader.read()){
					translationTable.push(i);
				}
			}
			range = translationTable.length;
		}
	}

	if(range === 1){
		if(index_colour){
			return {
				data: new Array(width*height).fill(translationTable[0]),
				isIndex: true
			}
		}
		return new Array(width*height).fill(translationTable[0])
	}
	else if(range === 2){
		let bitData = [];
		while(debug_reads < channel_options.bitLength){
			bitData.push(readBit());
			debug_reads++
		}
		let imgData = decode_bitimage(bitData,width,height);
		if(index_colour){
			return {
				data: imgData.map(value => index_colour[value]),
				isIndex: true
			}
		}
		return imgData.map(a => translationTable[a])
	}

	let hasCrossPrediction = global_options.crossPrediction && context_data.luma;
	let origMap;

	const crossPredictionSize = 128;
	if(hasCrossPrediction){
		origMap = new Array(Math.ceil(width/crossPredictionSize)).fill(0).map(
			b => new Array(context_data.lumaRange).fill(0).map(a => 
				new Array(range).fill(1)
			)
		)
	}

	let hasCrossPredictionColour = global_options.crossPredictionColour && context_data.chroma;
	let origMapColour;

	if(hasCrossPredictionColour){
		origMapColour = new Array(Math.ceil(width/crossPredictionSize)).fill(0).map(
			b => new Array(context_data.chromaRange).fill(0).map(a => 
				new Array(range).fill(1)
			)
		)
	}

	let bestRow = new Array(width).fill(0);

	let chances = new Array(2*range-1).fill(1);

	const histogramSize = 32;
	const histogram_e_range = 15;
	const histogram_e_range_narrow = 8;

	let histograms = [
		{
			name: "regular",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		},
		{
			name: "null",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		},
		{
			name: "shallow",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		},
		{
			name: "global",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		},
		{
			name: "right",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		},
		{
			name: "left",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		},
		{
			name: "narrow",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		},
		{
			name: "right_shallow",
			histogram: new Array(range).fill(1),
			total: range,
			count: 0
		}
	];
	let pref_histogram = new Array(width).fill(0);

	//let histograms = new Array(Math.ceil(width/histogramSize)).fill(0).map(a => new Array(range).fill(1))

	//let histogram_e = new Array(range).fill(1);

	let dec = new ArithmeticDecoder(NUM_OF_BITS, reader);

	for(let index=0;index<width*height;index++){
		let predi = predictors[bestRow[index % width]].predict(index);

		let lowest = 0 - predi + range - 1;
		let highest = (range - 1) - predi + range - 1;
		if(hasCrossPrediction){
			let lower_absolute;
			let upper_absolute;
			if(channel_options.name === "I"){
				lower_absolute = Y_I_lower[context_data.luma[index]];
				upper_absolute = Y_I_upper[context_data.luma[index]];
			}
			else if(channel_options.name === "Q"){
				lower_absolute = Y_Q_lower[context_data.luma[index]];
				upper_absolute = Y_Q_upper[context_data.luma[index]];
			}
			let debug1;
			for(let i=0;i<translationTable.length;i++){
				if(translationTable[i] >= lower_absolute){
					debug1 = i;
					lowest = i - predi + range - 1;
					break
				}
			}
			let debug2;
			for(let i=translationTable.length;i--;){
				if(translationTable[i] <= upper_absolute){
					debug2 = i;
					highest = i - predi + range - 1;
					break
				}
			}
			/*if(index === 10000 && channel_options.name === "Q"){
				console.log("help",translationTable,upper_absolute,-predi +range - 1);
				console.log("orig",(range - 1),(range - 1) - predi + range - 1);
				console.log("spring?",lower_absolute);
				console.log("index??",debug1,translationTable);
				console.log("lowest???",lowest);
				console.log("predi????",- predi + range - 1,predi,range);
				console.log("data?????",decodedData[index - 1],decodedData[index - 1 - width],decodedData[index - width],decodedData[index - width + 1]);
			}*/
			if(!lowest && lowest !== 0){
				throw "what"
			}
			if(!highest && highest !== 0){
				throw "what"
			}
		}
		if(hasCrossPredictionColour && channel_options.name === "Q"){
			let lower_absolute = I_Q_lower[context_data.chroma[index]];
			let upper_absolute = I_Q_upper[context_data.chroma[index]];
			for(let i=0;i<translationTable.length;i++){
				if(translationTable[i] >= lower_absolute){
					lowest = Math.max(lowest,i - predi + range - 1);
					break
				}
			}
			for(let i=translationTable.length;i--;){
				if(translationTable[i] <= upper_absolute){
					highest = Math.min(highest,i - predi + range - 1);
					break
				}
			}
		}

		let localChances = [];
		let sumChances = 0;
		for(let i=0;i<chances.length;i++){
			if(i >= lowest && i <= highest){
				let chance = Math.pow(chances[i],0.9)
					* Math.cbrt(histograms[pref_histogram[index % width]].histogram[i + predi - range + 1])
					* (hasCrossPrediction ? Math.sqrt(
						origMap[
							Math.floor((index % width) / crossPredictionSize)
						][
							context_data.luma[index]
						][
							i + predi - range + 1
						]
					) : 1)
					* (hasCrossPredictionColour ? Math.sqrt(
						origMapColour[
							Math.floor((index % width) / crossPredictionSize)
						][
							context_data.chroma[index]
						][
							i + predi - range + 1
						]
					) : 1)
				localChances.push(chance)
				sumChances += chance
			}
			else{
				localChances.push(0)
			}
		}
		let scaleFactor = Math.ceil(sumChances/Math.pow(2,24))
		localChances = localChances.map(vv => {
			if(vv === 0){
				return 0
			}
			return Math.max(1,Math.round(vv/scaleFactor))
		})
		let predicted = dec.read(
			new FrequencyTable(localChances)
		)
		let value = predicted + predi - range + 1;


		/*let record = 1e6;
		let record_index = 0;
		for(let i=0;i<predictors.length;i++){
			let probability = Math.abs(value - predictors[i].predict(index));
			if(probability < record){
				record = probability;
				record_index = i;
			}
		};
		bestRow[index % width] = record_index;*/
		if(index % width === 0){
			let record = Math.abs(value - predictors[0].predict(index));
			let record_index = 0;
			for(let i=1;i<predictors.length;i++){
				let probability = Math.abs(value - predictors[i].predict(index));
				if(probability < record){
					record = probability;
					record_index = i;
				}
			};
			bestRow[index % width] = record_index;
			predictors[record_index].count++;
		}
		if(index >= width && (index + 1) % width !== 0){
			let record = Math.abs(value - predictors[0].predict(index)) + Math.abs(decodedData[index - width + 1] - predictors[0].predict(index - width + 1));
			let record_index = 0;
			for(let i=1;i<predictors.length;i++){
				let probability = Math.abs(value - predictors[i].predict(index)) + Math.abs(decodedData[index - width + 1] - predictors[i].predict(index - width + 1));
				if(probability < record){
					record = probability;
					record_index = i;
				}
			};
			bestRow[index % width + 1] = record_index;
			predictors[record_index].count++;
		}

		/*histograms[Math.floor((index % width) / histogramSize)][value]++;
		let negaIndex = index - histogramSize*width;
		if(negaIndex >= 0){
			histograms[Math.floor((index % width) / histogramSize)][decodedData[negaIndex]]--
		}*/
		decodedData.push(value);

		let nextPix = index + 1;
		if(nextPix % width === 0){
			histograms[0].histogram = new Array(range).fill(1);
			histograms[0].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[0].histogram[decodedData[nextPix - i*width + j]]++
					histograms[0].total++;
				}
			}
			histograms[2].histogram = new Array(range).fill(1);
			histograms[2].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[2].histogram[decodedData[nextPix - i*width + j]]++
					histograms[2].total++;
				}
			}
			histograms[4].histogram = new Array(range).fill(1);
			histograms[4].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[4].histogram[decodedData[nextPix - i*width + j]]++
					histograms[4].total++;
				}
			}
			histograms[5].histogram = new Array(range).fill(1);
			histograms[5].total = range;
			for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width) >= 0;i++){
				histograms[5].histogram[decodedData[nextPix - i*width]]++
				histograms[5].total++;
			}
			histograms[6].histogram = new Array(range).fill(1);
			histograms[6].total = range;
			for(let j=0;j<=histogram_e_range_narrow;j++){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[6].histogram[decodedData[nextPix - i*width + j]]++
					histograms[6].total++;
				}
			}
			histograms[7].histogram = new Array(range).fill(1);
			histograms[7].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[7].histogram[decodedData[nextPix - i*width + j]]++
					histograms[7].total++;
				}
			}
		}
		else{
			histograms[0].histogram[decodedData[index]]++
			histograms[0].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[0].histogram[decodedData[nextPix - i*width + histogram_e_range]]++
					histograms[0].total++;
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histograms[0].histogram[decodedData[nextPix - i*width - histogram_e_range - 1]]--
					histograms[0].total--
				}
			}
			histograms[2].histogram[decodedData[index]]++
			histograms[2].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[2].histogram[decodedData[nextPix - i*width + histogram_e_range]]++
					histograms[2].total++;
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histograms[2].histogram[decodedData[nextPix - i*width - histogram_e_range - 1]]--
					histograms[2].total--
				}
			}
			histograms[4].histogram[decodedData[index]]++
			histograms[4].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[4].histogram[decodedData[nextPix - i*width + histogram_e_range]]++
					histograms[4].total++;
				}
			}
			if((nextPix % width) > 0){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - 1) >= 0;i++){
					histograms[4].histogram[decodedData[nextPix - i*width - 1]]--
					histograms[4].total--
				}
			}
			histograms[5].histogram[decodedData[index]]++
			histograms[5].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width) >= 0;i++){
					histograms[5].histogram[decodedData[nextPix - i*width]]++
					histograms[5].total++;
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histograms[5].histogram[decodedData[nextPix - i*width - histogram_e_range - 1]]--
					histograms[5].total--
				}
			}
			histograms[6].histogram[decodedData[index]]++
			histograms[6].total++;
			if(width - (nextPix % width) >= histogram_e_range_narrow){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range_narrow) >= 0;i++){
					histograms[6].histogram[decodedData[nextPix - i*width + histogram_e_range_narrow]]++
					histograms[6].total++;
				}
			}
			if((nextPix % width) > histogram_e_range_narrow){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range_narrow - 1) >= 0;i++){
					histograms[6].histogram[decodedData[nextPix - i*width - histogram_e_range_narrow - 1]]--
					histograms[6].total--
				}
			}
			histograms[7].histogram[decodedData[index]]++
			histograms[7].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[7].histogram[decodedData[nextPix - i*width + histogram_e_range]]++
					histograms[7].total++;
				}
			}
			if((nextPix % width) > histogram_e_range_narrow){
				for(let i=0;i <= (histogram_e_range + 1) && (nextPix - i*width - histogram_e_range_narrow - 1) >= 0;i++){
					histograms[7].histogram[decodedData[nextPix - i*width - histogram_e_range_narrow - 1]]--
					histograms[7].total--
				}
			}
		}
		histograms[3].histogram[decodedData[index]]++;
		histograms[3].total++;
//
		histograms[pref_histogram[index % width]].count++;

		let h_record = histograms[0].histogram[value]/histograms[0].total;
		let h_record_index = 0;
		for(let i=1;i<histograms.length;i++){
			let temt_rec = histograms[i].histogram[value]/histograms[i].total;
			if(temt_rec > h_record){
				h_record = temt_rec;
				h_record_index = i
			}
		}
		pref_histogram[index % width] = h_record_index

		/*let nextPix = index + 1;
		if(nextPix % width === 0){
			histogram_e = new Array(range).fill(1);
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= 31 && (nextPix - i*width + j) >= 0;i++){
					histogram_e[decodedData[nextPix - i*width + j]]++
				}
			}
		}
		else{
			histogram_e[decodedData[index]]++
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histogram_e[decodedData[nextPix - i*width + histogram_e_range]]++
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histogram_e[decodedData[nextPix - i*width - histogram_e_range - 1]]--
				}
			}
		}*/

		if(hasCrossPrediction){
			origMap[
				Math.floor((index % width) / crossPredictionSize)
			][
				context_data.luma[index]
			][value]++;
			let negaIndex2 = index - crossPredictionSize*width;
			if(negaIndex2 >= 0){
				origMap[
					Math.floor((index % width) / crossPredictionSize)
				][
					context_data.luma[negaIndex2]
				][
					decodedData[negaIndex2]
				]--
			}
		}

		if(hasCrossPredictionColour){
			origMapColour[
				Math.floor((index % width) / crossPredictionSize)
			][
				context_data.chroma[index]
			][value]++;
			let negaIndex2 = index - crossPredictionSize*width;
			if(negaIndex2 >= 0){
				origMapColour[
					Math.floor((index % width) / crossPredictionSize)
				][
					context_data.chroma[negaIndex2]
				][
					decodedData[negaIndex2]
				]--
			}
		}

		chances[predicted]++
	}

	//console.log("histogram modes decoded",histograms);

	if(index_colour){
		return {
			data: decodedData.map(value => index_colour[value]),
			isIndex: true
		}
	}
	else{
		return decodedData.map(a => translationTable[a])
	}
}

onmessage = function(e){
	let workerResult = decodeChannel_lossless(...e.data);
	postMessage(workerResult);
}
