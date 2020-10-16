let decodeChannel_lossless = function(data,channel_options,global_options,context_data){
	console.info("Decoding",channel_options.name);
	const width = channel_options.width;
	const height = channel_options.height;
	const range = channel_options.range;

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

	let bestRow = new Array(width).fill(0);

	let chances = new Array(2*range-1).fill(1);

	let dec = new ArithmeticDecoder(NUM_OF_BITS, reader);

	for(let index=0;index<width*height;index++){
		let predi = predictors[bestRow[index % width]].predict(index);

		let lowest = 0 - predi + range - 1;
		let highest = (range - 1) - predi + range - 1;

		let localChances = [];
		for(let i=0;i<chances.length;i++){
			if(i >= lowest && i <= highest){
				localChances.push(chances[i])
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


		decodedData.push(value);
		chances[predicted]++
	}

	return decodedData
}
