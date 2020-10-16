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
		}
	];
	let smallest = range;
	let largest = 0;
	data.forEach(value => {
		smallest = Math.min(smallest,value);
		largest = Math.max(largest,value);
	})
	dataBuffer.push(...rePlex(smallest,Math.ceil(Math.log2(range))));
	dataBuffer.push(...rePlex(largest,Math.ceil(Math.log2(range))));
	if(smallest){
		data = data.map(value => value - smallest)
	}
	range = largest - smallest + 1;
	console.log("range",smallest,largest);

	let bestRow = new Array(width).fill(0);

	let chances = new Array(2*range - 1).fill(1);

	const histogramSize = 32;

	let histograms = new Array(Math.ceil(width/histogramSize)).fill(0).map(a => new Array(range).fill(1))

	let enc = new ArithmeticEncoder(NUM_OF_BITS, writer);
	data.forEach((value,index) => {
		let predi = predictors[bestRow[index % width]].predict(index);
		let predicted = value - predi + range - 1;

		let lowest = 0 - predi + range - 1;
		let highest = (range - 1) - predi + range - 1;

		let localChances = [];
		for(let i=0;i<chances.length;i++){
			if(i >= lowest && i <= highest){
				localChances.push(
					Math.round(
						Math.pow(chances[i],0.9)
						* Math.cbrt(histograms[Math.floor((index % width) / histogramSize)][i + predi - range + 1])
					)
				)
			}
			else{
				localChances.push(0)
			}
		}
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
		enc.write(
			{
				total: total,
				getLow: _ => getLow,
				getHigh: _ => getHigh
			},
			predicted
		)


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
			histograms[Math.floor((index % width) / histogramSize)][data[negaIndex]]--
		}

		chances[predicted]++;
	});
	enc.finish();
	
	console.log("first bytes of stream",dePlex(dataBuffer.slice(0,8)),dePlex(dataBuffer.slice(8,16)),dePlex(dataBuffer.slice(16,24)));

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
