importScripts("arith.js");
importScripts("colourspace.js");

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

	console.log("first bytes of stream",data[0],data[1],data[2]);

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

	let hasCrossPrediction = global_options.crossPrediction && context_data.luma;
	let origMap;

	const crossPredictionSize = 64;
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

	let histograms = new Array(Math.ceil(width/histogramSize)).fill(0).map(a => new Array(range).fill(1))

	let dec = new ArithmeticDecoder(NUM_OF_BITS, reader);

	for(let index=0;index<width*height;index++){
		let predi = predictors[bestRow[index % width]].predict(index);

		let lowest = 0 - predi + range - 1;
		let highest = (range - 1) - predi + range - 1;

		let localChances = [];
		for(let i=0;i<chances.length;i++){
			if(i >= lowest && i <= highest){
				localChances.push(
					Math.round(
						Math.pow(chances[i],0.9)
						* Math.cbrt(histograms[Math.floor((index % width) / histogramSize)][i + predi - range + 1])
						* (hasCrossPrediction ? Math.cbrt(
							origMap[
								Math.floor((index % width) / crossPredictionSize)
							][
								context_data.luma[index]
							][
								i + predi - range + 1
							]
						) : 1)
						* (hasCrossPredictionColour ? Math.cbrt(
							origMapColour[
								Math.floor((index % width) / crossPredictionSize)
							][
								context_data.chroma[index]
							][
								i + predi - range + 1
							]
						) : 1)
					)
				)
			}
			else{
				localChances.push(0)
			}
		}
		let predicted = dec.read(
			new FrequencyTable(localChances)
		)
		let value = predicted + predi - range + 1;


		let record = 1e6;
		let record_index = 0;
		for(let i=0;i<predictors.length;i++){
			let probability = Math.abs(value - predictors[i].predict(index));
			if(probability < record){
				record = probability;
				record_index = i;
			}
		};
		bestRow[index % width] = record_index;

		histograms[Math.floor((index % width) / histogramSize)][value]++;
		let negaIndex = index - histogramSize*width;
		if(negaIndex >= 0){
			histograms[Math.floor((index % width) / histogramSize)][decodedData[negaIndex]]--
		}

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

		decodedData.push(value);
		chances[predicted]++
	}

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
