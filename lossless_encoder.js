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

let encodeChannel_lossless = function(data,channel_options,global_options,context_data){
	console.info("Encoding",channel_options.name,channel_options.width,channel_options.height);
	const width = channel_options.width;
	const height = channel_options.height;
	let range = channel_options.range;

	let dataBuffer = [];
	let writer = {
		write: function(bit){
			dataBuffer.push(bit)
		},
		close: function(){}
	}

	let predictors = [
		{
			name: "previous",
			predict: function(index){
				if(index % width){
					return data[index - 1]
				}
				else if(index >= width){
					return data[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "top",
			predict: function(index){
				if(index >= width){
					return data[index - width]
				}
				else if(index % width){
					return data[index - 1]
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
						return Math.floor((data[index - 1] + data[index - width])/2)
					}
					else{
						return data[index - 1]
					}
				}
				else if(index >= width){
					return data[index - width]
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
						return Math.floor((data[index - 1] + data[index - width - 1])/2)
					}
					else{
						return data[index - 1]
					}
				}
				else if(index >= width){
					return data[index - width]
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
						return Math.floor((data[index - width] + data[index - width - 1])/2)
					}
					else{
						return data[index - 1]
					}
				}
				else if(index >= width){
					return data[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T-TR",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return Math.floor((data[index - width] + data[index - width + 1])/2)
				}
				else if(index >= width){
					return data[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_(L-TR)-T",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width && index % width){
					return Math.floor((Math.floor((data[index - 1] + data[index - width + 1])/2) + data[index - width])/2)
				}
				return 0
			},
			count: 0
		},
		{
			name: "paeth",
			predict: function(index){
				if(index % width && index >= width){
					let A = data[index - 1];
					let B = data[index - width];
					let C = data[index - width - 1];
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
					return data[index - width]
				}
				else if(index % width){
					return data[index - 1]
				}
				return 0
			},
			count: 0
		},
		{
			name: "top_left",
			predict: function(index){
				if(index % width && index >= width){
					return data[index - width - 1];
				}
				else if(index % width){
					return data[index - 1]
				}
				else if(index >= width){
					return data[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "top_right",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return data[index - width + 1];
				}
				else if(index >= width){
					return data[index - width]
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_L_L-TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((data[index - 1]*2 + data[index - width - 1])/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_L-TL_TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((data[index - 1] + data[index - width - 1]*2)/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T-TL_TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((data[index - width] + data[index - width - 1]*2)/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T_T-TL",
			predict: function(index){
				if(index % width && index >= width){
					return Math.floor((data[index - width]*2 + data[index - width - 1])/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T_T-TR",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return Math.floor((data[index - width]*2 + data[index - width + 1])/3)
				}
				return 0
			},
			count: 0
		},
		{
			name: "average_T-TR_TR",
			predict: function(index){
				if((index % width) < (width - 1) && index >= width){
					return Math.floor((data[index - width] + data[index - width + 1]*2)/3)
				}
				return 0
			},
			count: 0
		}
	];
	let translationTable = new Array(range);
	if(channel_options.indexed){
		dataBuffer.push(1);
		dataBuffer.push(...rePlex(channel_options.index.length,8));
		channel_options.index.forEach(colour => {
			dataBuffer.push(...rePlex(colour[0],8));
			dataBuffer.push(...rePlex(colour[1],8));
			dataBuffer.push(...rePlex(colour[2],8));
		})
	}
	else{
		dataBuffer.push(0);
		frequencyTable = new Array(range).fill(0);
		data.forEach(value => frequencyTable[value]++);
		let delta = 0;
		for(let i=0;i<range;i++){
			if(
				frequencyTable[i]
			){
				translationTable[i] = delta;
				delta++
			}
		}

		data = data.map(value => translationTable[value]);

		let occupied = frequencyTable.filter(a => a).length;
		range = occupied;

		const PRIMITIVE = buildBook(primitive_huffman(frequencyTable.length));

		delta_data = rePlex(occupied,Math.ceil(Math.log2(frequencyTable.length)));
		delta = 0;

		for(let i=0;i<frequencyTable.length;i++){
			delta++;
			if(frequencyTable[i]){
				delta_data = delta_data.concat(PRIMITIVE[delta - 1]);
				delta = 0
			}
		}
		//console.log("delta table size",delta_data.length);

		range_data = [];
		let rangeActive = false;
		delta = 0;
		let shift_counter = 0;
		for(let i=0;i<frequencyTable.length;i++){
			delta++;
			if(
				(frequencyTable[i] && rangeActive === false)
				|| (!frequencyTable[i] && rangeActive === true)
			){
				rangeActive = !rangeActive;
				shift_counter++;
				range_data = range_data.concat(PRIMITIVE[delta - 1]);
				delta = 0;

			}
			if(
				i === frequencyTable.length - 1
				&& rangeActive
			){
				range_data = range_data.concat(PRIMITIVE[delta]);
				shift_counter++
			}
		}
		range_data = rePlex(shift_counter/2,(Math.ceil(Math.log2(frequencyTable.length))) - 1).concat(range_data);

		if(occupied === frequencyTable.length){
			dataBuffer.push(0,0);
			console.log("no palette buckets");
		}
		if(Math.min(delta_data.length,range_data.length) < frequencyTable.length){
			if(delta_data.length < range_data.length){
				dataBuffer.push(0,1);
				dataBuffer.push(...delta_data);
				console.log("list table size",delta_data.length,"bits");
			}
			else{
				dataBuffer.push(1,0);
				dataBuffer.push(...range_data);
				console.log("range data size",range_data.length,"bits");
			}
		}
		else{
			dataBuffer.push(1,1);
			dataBuffer.push(...frequencyTable.map(a => !!a));
			console.log("binary bucked data size",frequencyTable.length,"bits");
		}
	}
	if(range === 1){
		dataBuffer = encodeVarint(dataBuffer.length,BYTE_LENGTH).concat(dataBuffer);
		while(dataBuffer.length % BYTE_LENGTH){
			dataBuffer.push(0)
		}
		let encodedData = [];
		while(dataBuffer.length > (BYTE_LENGTH - 1)){
			encodedData.push(dePlex(dataBuffer.splice(0,BYTE_LENGTH)))
		}
		return encodedData
	}
	else if(range === 2){
		console.info("bit image mode");
		dataBuffer = dataBuffer.concat(encode_bitimage(data,width,height));
		dataBuffer = encodeVarint(dataBuffer.length,BYTE_LENGTH).concat(dataBuffer);
		while(dataBuffer.length % BYTE_LENGTH){
			dataBuffer.push(0)
		}
		let encodedData = [];
		while(dataBuffer.length > (BYTE_LENGTH - 1)){
			encodedData.push(dePlex(dataBuffer.splice(0,BYTE_LENGTH)))
		}
		return encodedData
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

	let chances = new Array(2*range - 1).fill(1);

	const histogramSize = 32;

	const histogram_e_range = 15;
	const histogram_e_range_narrow = 8;
	//let histogram_e = new Array(range).fill(1);

	//let histograms = new Array(Math.ceil(width/histogramSize)).fill(0).map(a => new Array(range).fill(1));

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

	//let cheatMap = cheatinfo.map(lum => lum.filter((value,index) => translationTable[index] !== undefined));

	let enc = new ArithmeticEncoder(NUM_OF_BITS, writer);
	//let bolivar_debug = [];
	data.forEach((value,index) => {
		let predi = predictors[bestRow[index % width]].predict(index);
		let predicted = value - predi + range - 1;

		let lowest = 0 - predi + range - 1;
		let highest = (range - 1) - predi + range - 1;
		if(hasCrossPrediction){
			if(channel_options.name === "I"){
				let lower_absolute = Y_I_lower[context_data.luma[index]];
				while(translationTable[lower_absolute] === undefined){
					lower_absolute++
				}
				let translated = translationTable[lower_absolute];
				lowest = translated - predi + range - 1;

				let upper_absolute = Y_I_upper[context_data.luma[index]];
				while(translationTable[upper_absolute] === undefined){
					upper_absolute--;
				}
				translated = translationTable[upper_absolute];
				highest = translated - predi + range - 1;
			}
			else if(channel_options.name === "Q"){
				let lower_absolute = Y_Q_lower[context_data.luma[index]];
				while(translationTable[lower_absolute] === undefined){
					lower_absolute++
				}
				let translated = translationTable[lower_absolute];
				lowest = translated - predi + range - 1;

				let upper_absolute = Y_Q_upper[context_data.luma[index]];
				while(translationTable[upper_absolute] === undefined){
					upper_absolute--;
				}
				translated = translationTable[upper_absolute];
				highest = translated - predi + range - 1;
/*
//20496
if(index === 10000){
	//console.log("pixel 2677",lower_absolute,upper_absolute,translationTable[lower_absolute]-1,translationTable[upper_absolute],range);
	console.log("spring?",Y_Q_lower[context_data.luma[index]]);
	console.log("index??",translationTable[lower_absolute - 1],translationTable);
	console.log("lowest???",lowest);
	console.log("predi????",- predi + range - 1,predi,range);
	console.log("data?????",data[index - 1],data[index - 1 - width],data[index - width],data[index - width + 1]);
	//console.log("luma pixel 2677",context_data.luma[index],context_data.luma);
}*/
			}
			if(!lowest && lowest !== 0){
				console.log("asdfa",lowest);
				throw "what"
			}
			if(!highest && highest !== 0){
				throw "what"
			}
		}
		if(hasCrossPrediction && channel_options.name === "Q"){
			let lower_absolute = I_Q_lower[context_data.chroma[index]];
			while(translationTable[lower_absolute] === undefined){
				lower_absolute++
			}
			let translated = translationTable[lower_absolute];
			lowest = Math.max(lowest,translated - predi + range - 1);

			let upper_absolute = I_Q_upper[context_data.chroma[index]];
			while(translationTable[upper_absolute] === undefined){
				upper_absolute--;
			}
			translated = translationTable[upper_absolute];
			highest = Math.min(highest,translated - predi + range - 1);
		}
try{
		/*if(hasCrossPrediction){
			if(channel_options.name === "Q"){
				let lims = Q_limits_from_y(context_data.luma[index]);
				if(index === 0){
					console.log(lims,lowest,highest,(translationTable[lims.min] || 0) - predi + range - 1,(translationTable[lims.max] || range) - predi + range - 1,translationTable);
				}
				lowest = Math.max(lowest,(translationTable[lims.min] || 0) - predi + range - 1);
				highest = Math.min(highest,(translationTable[lims.max] || range) - predi + range - 1);
			}
			else if(channel_options.name === "I"){
				let lims = I_limits_from_y(context_data.luma[index]);
				if(index === 0){
					console.log(lims,lowest,highest,(translationTable[lims.min] || 0) - predi + range - 1,(translationTable[lims.max] || range) - predi + range - 1,translationTable);
				}
				lowest = Math.max(lowest,(translationTable[lims.min] || 0) - predi + range - 1);
				highest = Math.min(highest,(translationTable[lims.max] || range) - predi + range - 1);
			}
		}*/

		let localChances = [];
		let sumChances = 0;
		for(let i=0;i<chances.length;i++){
			if(
				i >= lowest
				&& i <= highest
				//&& (channel_options.name !== "I" || cheatMap[context_data.luma[index]][i + predi - range + 1])
			){
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
				localChances.push(chance);
				sumChances += chance
			}
			else{
				localChances.push(0)
			}
		};
		let scaleFactor = Math.ceil(sumChances/Math.pow(2,24))
		localChances = localChances.map(vv => {
			if(vv === 0){
				return 0
			}
			return Math.max(1,Math.round(vv/scaleFactor))
		})
		/*if(hasCrossPrediction){
			crossDebug[
				origMap[
					Math.floor((index % width) / crossPredictionSize)
				][
					context_data.luma[index]
				][
					value
				]
			]++
		}*/
		let total = 0;
		let getLow;
		let getHigh;
		for(let i=0;i<localChances.length;i++){
			if(predicted === i){
				getLow = total;
				getHigh = total + localChances[i]
			}
			total += localChances[i]
		}
		//bolivar_debug.push(-Math.log2((getHigh - getLow)/total));
try{
		enc.write(
			{
				total: total,
				getLow: _ => getLow,
				getHigh: _ => getHigh
			},
			predicted
		)
}
catch(e){
	console.log(e);
	console.log("fakeTable",{
				total: total,
				getLow: getLow,
				getHigh: getHigh
			});
	console.log(chances,localChances);
	throw "writer error";
}


		/*let record = Math.abs(value - predictors[0].predict(index));
		let record_index = 0;
		for(let i=1;i<predictors.length;i++){
			let probability = Math.abs(value - predictors[i].predict(index));
			if(probability < record){
				record = probability;
				record_index = i;
			}
		};
		bestRow[index % width] = record_index;
		predictors[record_index].count++;*/
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
			let record = Math.abs(value - predictors[0].predict(index)) + Math.abs(data[index - width + 1] - predictors[0].predict(index - width + 1));
			let record_index = 0;
			for(let i=1;i<predictors.length;i++){
				let probability = Math.abs(value - predictors[i].predict(index)) + Math.abs(data[index - width + 1] - predictors[i].predict(index - width + 1));
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
			histograms[Math.floor((index % width) / histogramSize)][data[negaIndex]]--
		}*/
		/*let nextPix = index + 1;
		if(nextPix % width === 0){
			histogram_e = new Array(range).fill(1);
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= 31 && (nextPix - i*width + j) >= 0;i++){
					histogram_e[data[nextPix - i*width + j]]++
				}
			}
		}
		else{
			histogram_e[data[index]]++
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histogram_e[data[nextPix - i*width + histogram_e_range]]++
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histogram_e[data[nextPix - i*width - histogram_e_range - 1]]--
				}
			}
		}*/
		let nextPix = index + 1;
		if(nextPix % width === 0){
			histograms[0].histogram = new Array(range).fill(1);
			histograms[0].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[0].histogram[data[nextPix - i*width + j]]++
					histograms[0].total++;
				}
			}
			histograms[2].histogram = new Array(range).fill(1);
			histograms[2].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[2].histogram[data[nextPix - i*width + j]]++
					histograms[2].total++;
				}
			}
			histograms[4].histogram = new Array(range).fill(1);
			histograms[4].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[4].histogram[data[nextPix - i*width + j]]++
					histograms[4].total++;
				}
			}
			histograms[5].histogram = new Array(range).fill(1);
			histograms[5].total = range;
			for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width) >= 0;i++){
				histograms[5].histogram[data[nextPix - i*width]]++
				histograms[5].total++;
			}
			histograms[6].histogram = new Array(range).fill(1);
			histograms[6].total = range;
			for(let j=0;j<=histogram_e_range_narrow;j++){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[6].histogram[data[nextPix - i*width + j]]++
					histograms[6].total++;
				}
			}
			histograms[7].histogram = new Array(range).fill(1);
			histograms[7].total = range;
			for(let j=0;j<=histogram_e_range;j++){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + j) >= 0;i++){
					histograms[7].histogram[data[nextPix - i*width + j]]++
					histograms[7].total++;
				}
			}
		}
		else{
			histograms[0].histogram[data[index]]++
			histograms[0].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[0].histogram[data[nextPix - i*width + histogram_e_range]]++
					histograms[0].total++;
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histograms[0].histogram[data[nextPix - i*width - histogram_e_range - 1]]--
					histograms[0].total--
				}
			}
			histograms[2].histogram[data[index]]++
			histograms[2].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[2].histogram[data[nextPix - i*width + histogram_e_range]]++
					histograms[2].total++;
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histograms[2].histogram[data[nextPix - i*width - histogram_e_range - 1]]--
					histograms[2].total--
				}
			}
			histograms[4].histogram[data[index]]++
			histograms[4].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[4].histogram[data[nextPix - i*width + histogram_e_range]]++
					histograms[4].total++;
				}
			}
			if((nextPix % width) > 0){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - 1) >= 0;i++){
					histograms[4].histogram[data[nextPix - i*width - 1]]--
					histograms[4].total--
				}
			}
			histograms[5].histogram[data[index]]++
			histograms[5].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width) >= 0;i++){
					histograms[5].histogram[data[nextPix - i*width]]++
					histograms[5].total++;
				}
			}
			if((nextPix % width) > histogram_e_range){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range - 1) >= 0;i++){
					histograms[5].histogram[data[nextPix - i*width - histogram_e_range - 1]]--
					histograms[5].total--
				}
			}
			histograms[6].histogram[data[index]]++
			histograms[6].total++;
			if(width - (nextPix % width) >= histogram_e_range_narrow){
				for(let i=1;i <= (histogram_e_range*2 + 1) && (nextPix - i*width + histogram_e_range_narrow) >= 0;i++){
					histograms[6].histogram[data[nextPix - i*width + histogram_e_range_narrow]]++
					histograms[6].total++;
				}
			}
			if((nextPix % width) > histogram_e_range_narrow){
				for(let i=0;i <= (histogram_e_range*2 + 1) && (nextPix - i*width - histogram_e_range_narrow - 1) >= 0;i++){
					histograms[6].histogram[data[nextPix - i*width - histogram_e_range_narrow - 1]]--
					histograms[6].total--
				}
			}
			histograms[7].histogram[data[index]]++
			histograms[7].total++;
			if(width - (nextPix % width) >= histogram_e_range){
				for(let i=1;i <= (histogram_e_range + 1) && (nextPix - i*width + histogram_e_range) >= 0;i++){
					histograms[7].histogram[data[nextPix - i*width + histogram_e_range]]++
					histograms[7].total++;
				}
			}
			if((nextPix % width) > histogram_e_range_narrow){
				for(let i=0;i <= (histogram_e_range + 1) && (nextPix - i*width - histogram_e_range_narrow - 1) >= 0;i++){
					histograms[7].histogram[data[nextPix - i*width - histogram_e_range_narrow - 1]]--
					histograms[7].total--
				}
			}
		}
		histograms[3].histogram[data[index]]++;
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
					data[negaIndex2]
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
					data[negaIndex2]
				]--
			}
		}

		chances[predicted]++;
}
catch(e){
	console.log("histograms",histograms);
	console.log(e,channel_options.name);
	console.log("value",value);
	console.log("value_real",value);
	console.log("luma",context_data.luma[index]);
	console.log("index",index);
	console.log("lookup values",Y_Q_lower[context_data.luma[index]],Y_Q_upper[context_data.luma[index]]);
	console.log("limits",
		0,
		(range - 1),
		lowest,
		highest
	);
	//console.log("I context",context_data.chroma[index]);
	console.log("table",translationTable);
	throw "terminated";
}
	});
	enc.finish();
	
	//console.log("first bytes of stream",dePlex(dataBuffer.slice(0,8)),dePlex(dataBuffer.slice(8,16)),dePlex(dataBuffer.slice(16,24)));

	/*let bolivar_canvas = document.getElementById("expensive");
	bolivar_canvas.width = width;
	bolivar_canvas.height = height;
	let bolivar_ctx = bolivar_canvas.getContext("2d");
	for(let j=0;j<height;j++){
		for(let i=0;i<height;i++){
			let boli_val = Math.round(bolivar_debug[j*height + i] * 15);
			bolivar_ctx.fillStyle = "rgb(" + boli_val + "," + boli_val + ","+ boli_val + ")";
			bolivar_ctx.fillRect(i,j,1,1);
		}
	}*/


	dataBuffer = encodeVarint(dataBuffer.length,BYTE_LENGTH).concat(dataBuffer);
	while(dataBuffer.length % BYTE_LENGTH){
		dataBuffer.push(0)
	}
	let encodedData = [];
	while(dataBuffer.length > (BYTE_LENGTH - 1)){
		encodedData.push(dePlex(dataBuffer.splice(0,BYTE_LENGTH)))
	}
	//console.log("predictors",predictors.map(pre => ({name: pre.name,count: pre.count})));
	//console.log("histogram modes",histograms);
	console.log(channel_options.name,encodedData.length,"bytes");
	return encodedData
}
