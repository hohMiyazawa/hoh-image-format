function rePlex(integer,base){
	if(!base){
		base = 8
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

let default_freqs = [];
default_freqs = default_freqs.concat([
	9000,
	10000,
	5000,
	2500,
	1250,
	800
])

for(let i=6;i<128;i++){
	default_freqs.push(600 - i*2)
}
for(let i=128;i<251;i++){
	default_freqs.push(600 - 512 + i*2)
}

default_freqs = default_freqs.concat([
	800,
	1250,
	2500,
	5000,
	10000
])

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
		let ele0 = Object.keys(freqs)[0];
		workList.push({
			isInternal: false,
			symbol: ele0,
			frequency: 0
		})
	}
	//console.log("pre-huffman size: " + sizeUsed * Math.ceil(Math.log2(Object.keys(freqs).length)));
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

let default_tree = createHuffman(default_freqs);
let default_book = buildBook(default_tree);

function buildBook(huffmanTree){
	//console.log(huffmanTree);
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
	let sizeUsed = 0;
	traverse(huffmanTree,[]).forEach(entry => {
		book[entry.symbol] = entry.code;
		sizeUsed += entry.code.length * entry.frequency
	})
	if(sizeUsed){
		//console.log("huffman size: " + sizeUsed)
	}
	return book
}

const smallSymbolTable = [
	"pixels",
	"whole",
	"vertical",
	"horizontal",
	"diagonal_NW",
	"diagonal_NE",
	"diagonal_solid_NW",
	"diagonal_solid_NE",
	"diagonal_solid_SW",
	"diagonal_solid_SE"
]

const largeSymbolTable = [
	"divide",
	"whole",
	"vertical",
	"horizontal",
	"diagonal_NW",
	"diagonal_NE",
	"diagonal_solid_NW",
	"diagonal_solid_NE"
]

function encodeHoh(imageData,options,CBdata,CRdata){
	let stats = {
		whole: 0,
		vertical: 0,
		single: 0,
		horizontal: 0,
		diagonal: 0,
		solid_diagonal: 0,
		vertical_improvements: 0,
		horizontal_improvements: 0,
		diagonal_improvements: 0,
		solid_diagonal_improvements: 0,
		small_gradients: 0,
		small_diagonals: 0,
		small_solid_diagonals: 0,
		lossy_small_gradients: 0,
		lossy_small_diagonals: 0,
		lossy_small_solid_diagonals: 0,
		unlikely_improvements: 0,
		huffman_tables: 0,
	}
	let t0 = performance.now();
	let hohData = [];
	let bitBuffer = [];

	let writeByteNative = function(integer){
		bitBuffer = bitBuffer.concat(rePlex(integer));
		hohData.push(dePlex(bitBuffer.splice(0,8)));
	}
	let writeBitNative = function(integer){
		bitBuffer.push(integer);
		if(bitBuffer.length > 7){
			hohData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}

	let aritmetic_queue = [];

	writeByteNative(72);writeByteNative(79);writeByteNative(72);
	let width = imageData.length;
	let height = 0;
	if(width){
		height = imageData[0].length
	}
	stats.width = width;
	stats.height = height;

	let encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));

	writeByteNative(width >> 8);
	writeByteNative(width % 256);
	writeByteNative(height >> 8);
	writeByteNative(height % 256);

	function grower(num){
		return Math.max(num - num*num/512,1)
	}

	let error_compare = function(chunck1,chunck2,offx,offy){
		let sumError = 0;
		for(let i=0;i<chunck1.length;i++){
			for(let j=0;j<chunck1[i].length;j++){
				if(offx + i < width && offy + j < height){
					let error = Math.pow(
						Math.abs(
							chunck2[i][j] - chunck1[i][j]
						)/grower(Math.max(
							chunck1[i][j],
							chunck2[i][j]
						)),
						2
					)
					sumError += error;
					if(
						options.edgeWeight
						&& chunck1.length > 4
						&& (
							(i === 0 && offx !== 0)
							|| (j === 0 && offy !== 0)
							|| i === chunck1.length - 1
							|| j === chunck1.length - 1
						)
					){
						sumError += error * (options.edgeWeight * (Math.sqrt(chunck1.length) - 1) - 1)
					}
				}
			}
		}
		return sumError/(chunck1.length * chunck1[0].length)
	}

	function get_chunck(x,y,size){
		let data = [];
		for(let i=x;i<x + size;i++){
			let col = [];
			if(i >= width){
				for(let j=y;j<y + size;j++){
					col.push(imageData[width - 1][j] || imageData[width - 1][height - 1])
				}
			}
			else{
				for(let j=y;j<y + size;j++){
					if(j >= height){
						col.push(imageData[i][height - 1])
					}
					else{
						col.push(imageData[i][j])
					}
				}
			}
			data.push(col)
		}
		return data
	}

	let find_average = function(chunck){
		let sum = 0;
		for(let i=0;i < chunck.length;i++){
			for(let j=0;j < chunck[i].length;j++){
				sum += chunck[i][j]
			}
		}
		return Math.round(sum/(chunck.length * chunck[0].length))
	}

	if(options.quantizer === 0){
		options.forceGradients = false//useless in lossless mode
	}
	if(!options.hasOwnProperty("maxBlockSize")){//use a sane limit, if no limit provided
		options.maxBlockSize = 64
	}

	let encodeHuffTable = function(root,symbols){
		let bitArray = [];
		let blockLength = 8;
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

	let encode_channel = function(){
		let testMonochrome = function(){
			for(let i=0;i<width;i++){
				for(let j=0;j<height;j++){
					if(
						!(imageData[i][j] === 0
						|| imageData[i][j] === 255)
					){
						return false
					}
				}
			}
			return true
		}

		let monochrome = options.quantizer === 0 && testMonochrome();
		let blockQueue = [{x: 0,y:0, size: encoding_size}];
		let symbolFrequency = {};
		smallSymbolTable.forEach(word => symbolFrequency[word] = 0);

		let largeSymbolFrequency = {};
		largeSymbolTable.forEach(word => largeSymbolFrequency[word] = 0);

		let integerFrequency = new Array(256).fill(0);

		let writeSymbol = function(symbol){
			aritmetic_queue.push(symbol);
			symbolFrequency[symbol]++
		}
		let writeLargeSymbol = function(symbol){
			aritmetic_queue.push([symbol]);
			largeSymbolFrequency[symbol]++
		}
		let forige = 0;
		let writeByte = function(integer){
			let encodedInteger = integer - forige;
			forige = integer;
			if(encodedInteger < 0){
				encodedInteger += 256
			}
			aritmetic_queue.push(encodedInteger);
			integerFrequency[encodedInteger]++
		}
		if(monochrome){
			writeByte = function(integer){
				//if(integer === 0 || integer === 255){
					aritmetic_queue.push(integer);
					integerFrequency[integer]++
				//}
				//else{
					//throw "non-monochrome colour in monochrome mode"
				//}
			}
		}

		while(blockQueue.length){
			let curr = blockQueue.pop();
			if(
				curr.x >= width
				|| curr.y >= height
			){
				continue
			}
			if(
				(
					options.maxBlockSize && curr.size > options.maxBlockSize
				)
				|| (
					options.quantizer === 0
					&& curr.size > 2
					&& imageData[curr.x][curr.y] !== imageData[curr.x + 1][curr.y]
					&& imageData[curr.x][curr.y] !== imageData[curr.x][curr.y + 1]
					&& imageData[curr.x][curr.y + 1] !== imageData[curr.x + 1][curr.y]
					&& imageData[curr.x][curr.y] !== imageData[curr.x + 1][curr.y + 1]
				)
			){
				writeLargeSymbol("divide");
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
				continue
			}
			let chunck = get_chunck(curr.x,curr.y,curr.size);
			if(curr.size >= 4){
				let average = find_average(chunck);
				let avg_error = error_compare(chunck,create_uniform(average,curr.size),curr.x,curr.y);
				let localQuantizer = (options.quantizer * (1 - Math.sqrt(curr.size/encoding_size))) / (1 + curr.size/16);
				if(curr.size < 16 && avg_error <= localQuantizer){
					let partialA = error_compare(get_chunck(curr.x,curr.y,curr.size/2),create_uniform(average,curr.size/2),curr.x,curr.y);
					let partialB = error_compare(get_chunck(curr.x + curr.size/2,curr.y,curr.size/2),create_uniform(average,curr.size/2),curr.x + curr.size/2);
					let partialC = error_compare(get_chunck(curr.x,curr.y + curr.size/2,curr.size/2),create_uniform(average,curr.size/2),curr.x,curr.y + curr.size/2);
					let partialD = error_compare(get_chunck(curr.x + curr.size/2,curr.y + curr.size/2,curr.size/2),create_uniform(average,curr.size/2),curr.x + curr.size/2);
					if(Math.max(partialA,partialB,partialC,partialD) <= 1 * options.quantizer){
						writeLargeSymbol("whole");
						writeByte(average);
						stats.whole++;
						continue;
					}
				}
//unclean
				let mArr;
				if(options.quantizer === 0){//only the corner pixels matter in lossless mode, so about 25% of the encoding time can be saved here
					mArr = [
						chunck[0][0],
						chunck[0][0],
						chunck[curr.size - 1][0],
						chunck[curr.size - 1][0],

						chunck[0][0],
						chunck[0][0],
						chunck[curr.size - 1][0],
						chunck[curr.size - 1][0],

						chunck[0][curr.size - 1],
						chunck[0][curr.size - 1],
						chunck[curr.size - 1][curr.size - 1],
						chunck[curr.size - 1][curr.size - 1],

						chunck[0][curr.size - 1],
						chunck[0][curr.size - 1],
						chunck[curr.size - 1][curr.size - 1],
						chunck[curr.size - 1][curr.size - 1]
					]
				}
				else{
					mArr = [
						find_average(get_chunck(curr.x,curr.y,curr.size/4)),
						find_average(get_chunck(curr.x + curr.size/4,curr.y,curr.size/4)),
						find_average(get_chunck(curr.x + 2*curr.size/4,curr.y,curr.size/4)),
						find_average(get_chunck(curr.x + 3*curr.size/4,curr.y,curr.size/4)),

						find_average(get_chunck(curr.x,curr.y + curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + curr.size/4,curr.y + curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + 2*curr.size/4,curr.y + curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + 3*curr.size/4,curr.y + curr.size/4,curr.size/4)),

						find_average(get_chunck(curr.x,curr.y + 2*curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + curr.size/4,curr.y + 2*curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + 2*curr.size/4,curr.y + 2*curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + 3*curr.size/4,curr.y + 2*curr.size/4,curr.size/4)),

						find_average(get_chunck(curr.x,curr.y + 3*curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + curr.size/4,curr.y + 3*curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + 2*curr.size/4,curr.y + 3*curr.size/4,curr.size/4)),
						find_average(get_chunck(curr.x + 3*curr.size/4,curr.y + 3*curr.size/4,curr.size/4))
					]
				}
				let top = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[3])/4);
				let bottom = Math.round((mArr[12] + mArr[13] + mArr[14] + mArr[15])/4);
				let vertical_error = error_compare(chunck,create_vertical_gradient(top,bottom,curr.size),curr.x,curr.y);
				let left = Math.round((mArr[0] + mArr[4] + mArr[8] + mArr[12])/4);
				let right = Math.round((mArr[3] + mArr[7] + mArr[11] + mArr[15])/4);
				let horizontal_error = error_compare(chunck,create_horizontal_gradient(left,right,curr.size),curr.x,curr.y);

				let diagonal1_error = error_compare(chunck,create_diagonal_gradient(mArr[0],mArr[15],false,curr.size),curr.x,curr.y);
				let diagonal2_error = error_compare(chunck,create_diagonal_gradient(mArr[3],mArr[12],true,curr.size),curr.x,curr.y);

				let NW_s = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[4] + mArr[5] + mArr[8])/6);
				let SE_s = Math.round((mArr[7] + mArr[10] + mArr[11] + mArr[13] + mArr[14] + mArr[15])/6);

				let NE_s = Math.round((mArr[1] + mArr[2] + mArr[3] + mArr[6] + mArr[7] + mArr[11])/6);
				let SW_s = Math.round((mArr[4] + mArr[8] + mArr[9] + mArr[12] + mArr[13] + mArr[14])/6);

				let solid1_error = error_compare(chunck,create_diagonal_solid(NW_s,SE_s,false,curr.size),curr.x,curr.y);
				let solid2_error = error_compare(chunck,create_diagonal_solid(NE_s,SW_s,true,curr.size),curr.x,curr.y);

				let orto_error = Math.min(horizontal_error,vertical_error);
				let dia_error = Math.min(diagonal1_error,diagonal2_error,solid1_error,solid2_error);
				if(options.forceGradients){
					let newNW_s = Math.min(NW_s + 1,255);
					let diff = 1;
					if(NW_s < SE_s){
						newNW = Math.max(NW_s - 1,0);
						diff = -1
					}
					let new_solid1_error = error_compare(chunck,create_diagonal_solid(newNW_s,SE_s,false,curr.size),curr.x,curr.y);
					while(new_solid1_error < solid1_error){
						stats.solid_diagonal_improvements++;
						NW_s = newNW_s;
						solid1_error = new_solid1_error;
						newNW_ = Math.min(255,Math.max(newNW_s + diff,0));
						new_solid1_error = error_compare(chunck,create_diagonal_solid(newNW_s,SE_s,false,curr.size),curr.x,curr.y);
					}


					let newNE_s = Math.min(NE_s + 1,255);
					diff = 1;
					if(NE_s < SW_s){
						newNE = Math.max(NE_s - 1,0);
						diff = -1
					}
					let new_solid2_error = error_compare(chunck,create_diagonal_solid(newNE_s,SW_s,true,curr.size),curr.x,curr.y);
					while(new_solid2_error < solid2_error){
						stats.solid_diagonal_improvements++;
						NE_s = newNE_s;
						solid2_error = new_solid2_error;
						newNE_ = Math.min(255,Math.max(newNE_s + diff,0));
						new_solid2_error = error_compare(chunck,create_diagonal_solid(newNE_s,SW_s,true,curr.size),curr.x,curr.y);
					}
				}
				if(Math.min(orto_error,avg_error) <= dia_error){
					if(avg_error <= orto_error){
						let partialA = error_compare(get_chunck(curr.x,curr.y,curr.size/2),create_uniform(average,curr.size/2),curr.x,curr.y);
						let partialB = error_compare(get_chunck(curr.x + curr.size/2,curr.y,curr.size/2),create_uniform(average,curr.size/2),curr.x + curr.size/2);
						let partialC = error_compare(get_chunck(curr.x,curr.y + curr.size/2,curr.size/2),create_uniform(average,curr.size/2),curr.x,curr.y + curr.size/2);
						let partialD = error_compare(get_chunck(curr.x + curr.size/2,curr.y + curr.size/2,curr.size/2),create_uniform(average,curr.size/2),curr.x + curr.size/2);
						if(Math.max(partialA,partialB,partialC,partialD) <= 1 * options.quantizer){
							writeLargeSymbol("whole");
							writeByte(average);
							stats.whole++;
							continue;
						}
					}
					else{
						if(vertical_error < horizontal_error){
							if(options.forceGradients){
								let newTop = Math.min(top + 1,255);
								let diff = 1;
								if(top < bottom){
									newTop = Math.max(top - 1,0);
									diff = -1
								}
								let new_vertical_error = error_compare(chunck,create_vertical_gradient(newTop,bottom,curr.size),curr.x,curr.y);
								while(new_vertical_error < vertical_error){
									stats.vertical_improvements++;
									top = newTop;
									vertical_error = new_vertical_error;
									newTop = Math.min(255,Math.max(newTop + diff,0));
									new_vertical_error = error_compare(chunck,create_vertical_gradient(newTop,bottom,curr.size),curr.x,curr.y);
								}
								let newBottom = Math.min(bottom + 1,255);
								if(diff){
									newBottom = Math.max(bottom - 1,0);
								}
								new_vertical_error = error_compare(chunck,create_vertical_gradient(top,newBottom,curr.size),curr.x,curr.y);
								while(new_vertical_error < vertical_error){
									stats.vertical_improvements++;
									bottom = newBottom;
									vertical_error = new_vertical_error;
									newBottom = Math.min(255,Math.max(newBottom - diff,0));
									new_vertical_error = error_compare(chunck,create_vertical_gradient(top,newBottom,curr.size),curr.x,curr.y);
								}
								if(options.forceGradientsExtra){
									diff = -diff;
									newTop = Math.min(255,Math.max(newTop + diff,0));
									new_vertical_error = error_compare(chunck,create_vertical_gradient(newTop,bottom,curr.size),curr.x,curr.y);
									while(new_vertical_error < vertical_error){
										stats.unlikely_improvements++;
										top = newTop;
										vertical_error = new_vertical_error;
										newTop = Math.min(255,Math.max(newTop + diff,0));
										new_vertical_error = error_compare(chunck,create_vertical_gradient(newTop,bottom,curr.size),curr.x,curr.y);
									}
									newBottom =  Math.min(255,Math.max(newBottom - diff,0));
									new_vertical_error = error_compare(chunck,create_vertical_gradient(top,newBottom,curr.size),curr.x,curr.y);
									while(new_vertical_error < vertical_error){
										stats.unlikely_improvements++;
										bottom = newBottom;
										vertical_error = new_vertical_error;
										newBottom = Math.min(255,Math.max(newBottom - diff,0));
										new_vertical_error = error_compare(chunck,create_vertical_gradient(top,newBottom,curr.size),curr.x,curr.y);
									}
								}
							}
							if(vertical_error <= localQuantizer){
								writeLargeSymbol("vertical");
								writeByte(top);
								writeByte(bottom);
								stats.vertical++;
								continue
							}
						}
						else{
							if(options.forceGradients){
								let newLeft = Math.min(left + 1,255);
								let diff = 1;
								if(left < right){
									newLeft = Math.max(left - 1,0);
									diff = -1
								}
								let new_horizontal_error = error_compare(chunck,create_horizontal_gradient(newLeft,right,curr.size),curr.x,curr.y);
								while(new_horizontal_error < horizontal_error){
									stats.horizontal_improvements++;
									left = newLeft;
									horizontal_error = new_horizontal_error;
									newLeft = Math.min(255,Math.max(newLeft + diff,0));
									new_horizontal_error = error_compare(chunck,create_horizontal_gradient(newLeft,right,curr.size),curr.x,curr.y);
								}
								let newRight = Math.min(right + 1,255);
								if(diff){
									newRight = Math.max(right - 1,0);
								}
								new_horizontal_error = error_compare(chunck,create_horizontal_gradient(left,newRight,curr.size),curr.x,curr.y);
								while(new_horizontal_error < horizontal_error){
									stats.horizontal_improvements++;
									right = newRight;
									horizontal_error = new_horizontal_error;
									newRight = Math.min(255,Math.max(newRight - diff,0));
									new_horizontal_error = error_compare(chunck,create_horizontal_gradient(left,newRight,curr.size),curr.x,curr.y);
								}
								if(options.forceGradientsExtra){
									diff = -diff;
									newLeft = Math.min(255,Math.max(newLeft + diff,0));
									new_horizontal_error = error_compare(chunck,create_horizontal_gradient(newLeft,right,curr.size),curr.x,curr.y);
									while(new_horizontal_error < horizontal_error){
										stats.unlikely_improvements++;
										left = newLeft;
										horizontal_error = new_horizontal_error;
										newLeft = Math.min(255,Math.max(newLeft + diff,0));
										new_horizontal_error = error_compare(chunck,create_horizontal_gradient(newLeft,right,curr.size),curr.x,curr.y);
									}
									newRight = Math.min(255,Math.max(newRight - diff,0));
									new_horizontal_error = error_compare(chunck,create_horizontal_gradient(left,newRight,curr.size),curr.x,curr.y);
									while(new_horizontal_error < horizontal_error){
										stats.unlikely_improvements++;
										right = newRight;
										horizontal_error = new_horizontal_error;
										newRight = Math.min(255,Math.max(newRight - diff,0));
										new_horizontal_error = error_compare(chunck,create_horizontal_gradient(left,newRight,curr.size),curr.x,curr.y);
									}
								}
							}
							if(horizontal_error <= localQuantizer){
								writeLargeSymbol("horizontal");
								writeByte(left);
								writeByte(right);
								stats.horizontal++;
								continue
							}
						}
					}
				}
				else{
					if(Math.min(diagonal1_error,diagonal2_error) <= Math.min(solid1_error,solid2_error)){
						if(diagonal1_error < diagonal2_error){
							let NW = mArr[0];
							let SE = mArr[15];
							if(options.forceGradients){
								let newNW = Math.min(NW + 1,255);
								let diff = 1;
								if(NW < SE){
									newNW = Math.max(NW - 1,0);
									diff = -1
								}
								let new_diagonal1_error = error_compare(chunck,create_diagonal_gradient(newNW,SE,false,curr.size),curr.x,curr.y);
								while(new_diagonal1_error < diagonal1_error){
									stats.diagonal_improvements++;
									NW = newNW;
									diagonal1_error = new_diagonal1_error;
									newNW = Math.min(255,Math.max(newNW + diff,0));
									new_diagonal1_error = error_compare(chunck,create_diagonal_gradient(newNW,SE,false,curr.size),curr.x,curr.y)
								}

								let newSE = Math.min(SE + 1,255);
								if(diff){
									newSE = Math.max(SE - 1,0);
								}
								new_diagonal1_error = error_compare(chunck,create_diagonal_gradient(NW,newSE,false,curr.size),curr.x,curr.y);
								while(new_diagonal1_error < diagonal1_error){
									stats.diagonal_improvements++;
									SE = newSE;
									diagonal1_error = new_diagonal1_error;
									newSE = Math.min(255,Math.max(newSE - diff,0));
									new_diagonal1_error = error_compare(chunck,create_diagonal_gradient(NW,newSE,false,curr.size),curr.x,curr.y)
								}
							}
							if(diagonal1_error <= localQuantizer){
								writeLargeSymbol("diagonal_NW");
								writeByte(NW);
								writeByte(SE);
								stats.diagonal++;
								continue
							}
						}
						else{
							let NE = mArr[3];
							let SW = mArr[12];
							if(options.forceGradients){
								let newNE = Math.min(NE + 1,255);
								let diff = 1;
								if(NE < SW){
									newNE = Math.max(NE - 1,0);
									diff = -1
								}
								let new_diagonal2_error = error_compare(chunck,create_diagonal_gradient(newNE,SW,true,curr.size),curr.x,curr.y);
								while(new_diagonal2_error < diagonal2_error){
									stats.diagonal_improvements++;
									NE = newNE;
									diagonal2_error = new_diagonal2_error;
									newNE = Math.min(255,Math.max(newNE + diff,0));
									new_diagonal2_error = error_compare(chunck,create_diagonal_gradient(newNE,SW,true,curr.size),curr.x,curr.y)
								}

								let newSW = Math.min(SW + 1,255);
								if(diff){
									newSW = Math.max(SW - 1,0);
								}
								new_diagonal2_error = error_compare(chunck,create_diagonal_gradient(NE,newSW,true,curr.size),curr.x,curr.y);
								while(new_diagonal2_error < diagonal2_error){
									stats.diagonal_improvements++;
									SW = newSW;
									diagonal2_error = new_diagonal2_error;
									newSW = Math.min(255,Math.max(newSW - diff,0));
									new_diagonal2_error = error_compare(chunck,create_diagonal_gradient(NE,newSW,true,curr.size),curr.x,curr.y)
								}
							}
							if(diagonal2_error <= localQuantizer){
								writeLargeSymbol("diagonal_NE");
								writeByte(NE);
								writeByte(SW);
								stats.diagonal++;
								continue
							}
						}
					}
					else{
						if(solid1_error < solid2_error){
							if(solid1_error <= localQuantizer){
								writeLargeSymbol("diagonal_solid_NW");
								writeByte(NW_s);
								writeByte(SE_s);
								stats.solid_diagonal++;
								continue
							}
						}
						else{
							if(solid2_error <= localQuantizer){
								writeLargeSymbol("diagonal_solid_NE");
								writeByte(NE_s);
								writeByte(SW_s);
								stats.solid_diagonal++;
								continue
							}
						}
					}
	
				}
//unclean
				writeLargeSymbol("divide");
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
				continue		}
			if(curr.size === 2){
				let avg = Math.round((chunck[0][0] + chunck[1][0] + chunck[0][1] + chunck[1][1])/4);
				let wholeError = error_compare([[avg,avg],[avg,avg]],chunck,0,0);
				if(
					wholeError <= options.quantizer
				){
					writeSymbol("whole");
					writeByte(chunck[0][0]);
					stats.whole++;
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][1] === chunck[1][1]
				){
					writeSymbol("vertical");
					writeByte(chunck[0][0]);
					writeByte(chunck[0][1]);
					stats.small_gradients++;
					continue
				}
				if(
					chunck[0][0] === chunck[0][1]
					&& chunck[1][0] === chunck[1][1]
				){
					writeSymbol("horizontal");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1]);
					stats.small_gradients++;
					continue
				}
				let dia1_err = error_compare(create_diagonal_gradient(chunck[0][0],chunck[1][1],false,2),chunck,0,0);
				if(dia1_err === 0){
					writeSymbol("diagonal_NW");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1]);
					stats.small_diagonals++;
					continue
				}
				let dia2_err = error_compare(create_diagonal_gradient(chunck[1][0],chunck[0][1],true,2),chunck,0,0);
				if(dia2_err === 0){
					writeSymbol("diagonal_NE");
					writeByte(chunck[1][0]);
					writeByte(chunck[0][1]);
					stats.small_diagonals++;
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSymbol("diagonal_solid_NW");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1]);
					stats.small_solid_diagonals++;
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[1][1]
				){
					writeSymbol("diagonal_solid_NE");
					writeByte(chunck[0][0]);
					writeByte(chunck[0][1]);
					stats.small_solid_diagonals++;
					continue
				}
				if(
					chunck[0][1] === chunck[1][1]
					&& chunck[1][1] === chunck[1][0]
				){
					writeSymbol("diagonal_solid_SE");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1]);
					stats.small_solid_diagonals++;
					continue
				}
				if(
					chunck[0][1] === chunck[1][1]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSymbol("diagonal_solid_SW");
					writeByte(chunck[1][0]);
					writeByte(chunck[0][1]);
					stats.small_solid_diagonals++;
					continue
				}
				if(options.lossySmallGradients && options.quantizer){
					let upper_avg = Math.round((chunck[0][0] + chunck[1][0])/2);
					let lower_avg = Math.round((chunck[0][1] + chunck[1][1])/2);
					let left_avg = Math.round((chunck[0][0] + chunck[0][1])/2);
					let right_avg = Math.round((chunck[1][0] + chunck[1][1])/2);
					let NW_avg = Math.round((chunck[0][0] + chunck[1][0] + chunck[0][1])/3);
					let NE_avg = Math.round((chunck[0][0] + chunck[1][0] + chunck[1][1])/3);

					let SW_avg = Math.round((chunck[0][0] + chunck[0][1] + chunck[1][1])/3);
					let SE_avg = Math.round((chunck[1][0] + chunck[0][1] + chunck[1][1])/3);

					let lossyVerticalError = error_compare([[upper_avg,lower_avg],[upper_avg,lower_avg]],chunck,0,0);
					let lossyHorizontalError = error_compare([[left_avg,left_avg],[right_avg,right_avg]],chunck,0,0);
					let solid1Error = error_compare([[NW_avg,NW_avg],[NW_avg,chunck[1][1]]],chunck,0,0);
					let solid2Error = error_compare([[NE_avg,chunck[0][1]],[NE_avg,NE_avg]],chunck,0,0);

					let weird1Error = error_compare([[chunck[0][0],SE_avg],[SE_avg,SE_avg]],chunck,0,0);
					let weird2Error = error_compare([[SW_avg,SW_avg],[chunck[1][0],SW_avg]],chunck,0,0);

					if(Math.min(lossyVerticalError,lossyHorizontalError) <= Math.min(dia1_err,dia2_err,solid1Error,solid2Error,weird1Error,weird2Error)){
						if(lossyVerticalError < lossyHorizontalError){
							if(lossyVerticalError <= options.quantizer){
							writeSymbol("vertical");
								writeByte(upper_avg);
								writeByte(lower_avg);
								stats.lossy_small_gradients++;
								continue
							}
						}
						else{
							if(lossyHorizontalError <= options.quantizer){
								writeSymbol("horizontal");
								writeByte(left_avg);
								writeByte(right_avg);
								stats.lossy_small_gradients++;
								continue
							}
						}
					}
					else{
						if(Math.min(dia1_err,dia2_err) <= Math.min(solid1Error,solid2Error,weird1Error,weird2Error)){
							if(dia1_err < dia2_err){
								if(dia1_err <= options.quantizer){
									writeSymbol("diagonal_NW");
									writeByte(chunck[0][0]);
									writeByte(chunck[1][1]);
									stats.lossy_small_diagonals++;
									continue
								}
							}
							else{
								if(dia2_err <= options.quantizer){
									writeSymbol("diagonal_NE");
									writeByte(chunck[1][0]);
									writeByte(chunck[0][1]);
									stats.lossy_small_diagonals++;
									continue
								}
							}
						}
						else{
							if(Math.min(solid1Error,solid2Error) < Math.min(weird1Error,weird2Error)){
								if(solid1Error < solid2Error){
									if(solid1Error <= options.quantizer){
										writeSymbol("diagonal_solid_NW");
										writeByte(chunck[0][0]);
										writeByte(chunck[1][1]);
										stats.lossy_small_solid_diagonals++;
										continue
									}
								}
								else{
									if(solid2Error <= options.quantizer){
										writeSymbol("diagonal_solid_NE");
										writeByte(chunck[1][0]);
										writeByte(chunck[0][1]);
										stats.lossy_small_solid_diagonals++;
										continue
									}
								}
							}
							else{
								if(weird1Error < weird2Error){
									if(weird1Error <= options.quantizer){
										writeSymbol("diagonal_solid_SE");
										writeByte(chunck[0][0]);
										writeByte(chunck[1][1]);
										stats.lossy_small_solid_diagonals++;
										continue
									}
								}
								else{
									if(weird2Error <= options.quantizer){
										writeSymbol("diagonal_solid_SW");
										writeByte(chunck[1][0]);
										writeByte(chunck[0][1]);
										stats.lossy_small_solid_diagonals++;
										continue
									}
								}
							}
						}
					}
				}
				writeSymbol("pixels");
				stats.single += 4;
				writeByte(chunck[0][0]);
				writeByte(chunck[1][0]);
				writeByte(chunck[1][1]);
				writeByte(chunck[0][1]);
			}
		}
		let largeHuffman = createHuffman(largeSymbolFrequency);
		let largeSymbolBook = buildBook(largeHuffman);

		let smallHuffman = createHuffman(symbolFrequency);
		let smallSymbolBook = buildBook(smallHuffman);

		let optionalStats = {};

		let colourHuffman = createHuffman(integerFrequency);
		let colourBook = buildBook(colourHuffman);

		let size1 = hohData.length;

		let preUsage = integerFrequency.reduce((acc,val) => acc + val * 8,0);
		let postUsage = integerFrequency.reduce((acc,val,index) => {
			if(val){
				return acc + val * colourBook[index].length
			}
			else{
				return acc
			}
		},0)
		let defaultUsage = integerFrequency.reduce((acc,val,index) => {
			if(val){
				return acc + val * default_book[index].length
			}
			else{
				return acc
			}
		},0)

		/*console.log("ifr",integerFrequency);
		console.log("clb",colourBook);
		console.log("pre-usage",preUsage);
		console.log("post-usage",postUsage);*/

		let colourBuffer = encodeHuffTable(colourHuffman);
		/*console.log("table-size",colourBuffer.length);
		console.log("total",colourBuffer.length + postUsage);
		console.log("default_book",defaultUsage);*/
		/*console.log("pre-usage",preUsage/8);
		console.log("default",defaultUsage);
		console.log(monochrome,"total",colourBuffer.length + postUsage,colourBook);
		console.log("intf",integerFrequency);*/

		let mode = "huffman";
		if(monochrome){
			writeBitNative(0);
			writeBitNative(1);
			mode = "monochrome";
			console.log("using monochrome")
		}
		else if(defaultUsage < colourBuffer.length + postUsage){
			writeBitNative(1);
			writeBitNative(0);
			mode = "default";
			console.log("using default book")
		}
		else{
			writeBitNative(0);
			writeBitNative(0);
		}

		bitBuffer = bitBuffer.concat(encodeHuffTable(largeHuffman,largeSymbolTable));
		bitBuffer = bitBuffer.concat(encodeHuffTable(smallHuffman,smallSymbolTable));
		if(mode === "huffman"){
			bitBuffer = bitBuffer.concat(colourBuffer)
		}
		while(bitBuffer.length > 7){
			hohData.push(dePlex(bitBuffer.splice(0,8)))
		}

		stats.huffman_tables += hohData.length - size1;

		//console.log(largeSymbolBook);
		//console.log(smallSymbolBook);
		//console.log(colourBook);

		let largeSymbolNumber = 0;
		let symbolNumber = 0;
		let integerNumber = 0;

		aritmetic_queue.forEach(waiting => {
			if(Array.isArray(waiting)){
				bitBuffer.push(...largeSymbolBook[waiting[0]]);
				largeSymbolNumber++
			}
			else if(isFinite(waiting)){
				if(mode === "huffman"){
					bitBuffer.push(...colourBook[waiting]);
				}
				else if(mode === "default"){
					bitBuffer.push(...default_book[waiting]);
				}
				else{
					if(waiting === 0){
						bitBuffer.push(0)
					}
					else{
						bitBuffer.push(1)
					}
				}
				integerNumber++
			}
			else{
				bitBuffer.push(...smallSymbolBook[waiting]);
				symbolNumber++
			}
			while(bitBuffer.length > 7){
				hohData.push(dePlex(bitBuffer.splice(0,8)))
			}
		});
		aritmetic_queue = [];
		//console.log("largeSymbols",largeSymbolNumber);
		//console.log("symbols",symbolNumber);
		//console.log("colours",integerNumber);
	}

	encode_channel();

	let size1 = hohData.length;

	if(options.hasOwnProperty("subSampling")){
		options.quantizer = options.subSampling
	}
	imageData = CBdata;
	encode_channel();
	imageData = CRdata;
	encode_channel();

	while(bitBuffer.length){
		writeBitNative(0)
	}

	let t1 = performance.now();
	stats.time = (t1 - t0);
	stats.luma = size1 - 8;
	stats.chroma = hohData.length - size1 - 8;
	stats.size = hohData.length;

	if(hohStatsHandler){
		hohStatsHandler(stats)
	}
	console.log(stats);

	return Uint8Array.from(hohData) 
}

function decodeHoh(hohData){
	if(hohData.length < 7){
		return null
	}
	let currentIndex = 1;
	let bitBuffer = rePlex(hohData[0]);
	let readByteNative = function(){
		if(currentIndex < hohData.length){
			bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
		}
		return dePlex(bitBuffer.splice(0,8))
	}
	let readBit = function(){
		if(bitBuffer.length === 0 && currentIndex < hohData.length){
			bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
		}
		return bitBuffer.splice(0,1)[0]
	}
	if(!(readByteNative() === 72 && readByteNative() === 79 && readByteNative() === 72)){
		return null
	}
	let width = (readByteNative() << 8) + readByteNative();
	let height = (readByteNative() << 8) + readByteNative();

	let encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));

	console.log(width,height);


	let decodeHuffTable = function(symbols){
		let blockLength = 8;
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

	let decode_channel = function(){
	
		let imageData = [];
		for(let i=0;i<width;i++){
			imageData.push(new Array(height).fill(255))
		}

		let e_mode_1 = readBit();
		let e_mode_2 = readBit();

		let largeHuffman = decodeHuffTable(largeSymbolTable);
		let smallHuffman = decodeHuffTable(smallSymbolTable);
		let colourHuffman;
		let monochrome = false;
		if(e_mode_1 === 0 && e_mode_2 === 0){
			colourHuffman = decodeHuffTable()
		}
		else if(e_mode_1 === 1 && e_mode_2 === 0){
			colourHuffman = default_tree
		}
		else{
			monochrome = true
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

		let forige = 0;

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
			let decodedInteger = (parseInt(head.symbol) + forige) % 256;
			forige = decodedInteger;
			return decodedInteger
		}
		if(monochrome){
			readColour = function(){
				let colourBit = readBit();
				if(colourBit){
					return 255
				}
				else{
					return 0
				}
			}
		}

		let blockQueue = [{x: 0,y:0, size: encoding_size}];

		let write2x2 = function(curr,a,b,c,d){
			if(curr.x + 1 < width){
				if(curr.y + 1 < height){
					imageData[curr.x][curr.y] = a;
					imageData[curr.x + 1][curr.y] = b;
					imageData[curr.x + 1][curr.y + 1] = c;
					imageData[curr.x][curr.y + 1] = d;
				}
				else{
					imageData[curr.x][curr.y] = a;
					imageData[curr.x + 1][curr.y] = b;
				}
			}
			else{
				if(curr.y + 1 < height){
					imageData[curr.x][curr.y] = a;
					imageData[curr.x][curr.y + 1] = d;
				}
				else{
					imageData[curr.x][curr.y] = a;
				}
			}
		}
		while(blockQueue.length){
			let curr = blockQueue.pop();
			if(
				curr.x >= width
				|| curr.y >= height
			){
				continue
			}
			if(curr.size === 1){
				throw "should never happen"
			}
			if(curr.size >= 4){
				let instruction = readLargeSymbol();
				if(instruction === "divide"){
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
				else if(instruction === "whole"){
					let solid = readColour();
					for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
						for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
							imageData[i][j] = solid
						}
					}
				}
				else if(instruction === "horizontal"){
					let left = readColour();
					let right = readColour();
					for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
						for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
							imageData[i][j] = Math.round(left + (right - left) * (i - curr.x) /(curr.size - 1))
						}
					}
				}
				else if(instruction === "vertical"){
					let top = readColour();
					let bottom = readColour();
					for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
						for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
							imageData[i][j] = Math.round(top + (bottom - top) * (j - curr.y) /(curr.size - 1))
						}
					}
				}
				else if(instruction === "diagonal_NW"){
					let colour1 = readColour();
					let colour2 = readColour();
					for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
						for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
							imageData[i][j] = Math.round(colour1 + (colour2 - colour1) * ((i - curr.x) + (j - curr.y))/(2*curr.size - 2))
						}
					}
				}
				else if(instruction === "diagonal_NE"){
					let colour1 = readColour();
					let colour2 = readColour();
					for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
						for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
							imageData[i][j] = Math.round(colour1 + (colour2 - colour1) * ((curr.size - (i - curr.x) - 1) + (j - curr.y))/(2*curr.size - 2))
						}
					}
				}
				else if(instruction === "diagonal_solid_NW"){
					let colour1 = readColour();
					let colour2 = readColour();
					for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
						for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
							if(
								i + j - curr.x - curr.y < curr.size
							){
								imageData[i][j] = colour1
							}
							else{
								imageData[i][j] = colour2
							}
						}
					}
				}
				else if(instruction === "diagonal_solid_NE"){
					let colour1 = readColour();
					let colour2 = readColour();
					for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
						for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
							if(
								(curr.size - (i - curr.x) - 1) + j - curr.y < curr.size
							){
								imageData[i][j] = colour1
							}
							else{
								imageData[i][j] = colour2
							}
						}
					}
				}
			}
			if(curr.size === 2){
				let instruction = readSmallSymbol();
				if(instruction === "pixels"){
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
				else if(instruction === "diagonal_NW"){
					let a = readColour();
					let b = readColour();
					let avg = Math.round((a+b)/2);
					write2x2(curr,a,avg,b,avg)
				}
				else if(instruction === "diagonal_NE"){
					let a = readColour();
					let b = readColour();
					let avg = Math.round((a+b)/2);
					write2x2(curr,avg,a,avg,b)
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
			}
		}
		return imageData;
	}
	const luma = decode_channel();
	if(currentIndex < hohData.length){
		const CB = decode_channel();
		const CR = decode_channel();
		return {
			luma: luma,
			Cb: CB,
			Cr: CR
		}
	}
	else{
		return {
			luma: luma,
			Cb: [],
			Cr: []
		}
	}
}











