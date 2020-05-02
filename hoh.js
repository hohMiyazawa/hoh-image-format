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

function encodeHoh(imageData,options){
	let t0 = performance.now();
	let stats = {
		whole: 0,
		vertical: 0,
		single: 0,
		horizontal: 0,
		diagonal: 0,
		vertical_improvements: 0,
		horizontal_improvements: 0,
		diagonal_improvements: 0,
		small_gradients: 0,
		small_diagonals: 0,
		lossy_small_gradients: 0,
		lossy_small_diagonals: 0,
		unlikely_improvements: 0,
		negative_zero_abuse: 0,
		chunking: {
			fail: 0,
			one: 0,
			two: 0,
			three: 0
		}
	}
	let hohData = [];
	let bitBuffer = [];
	
	let colour_byte_counter = 0;

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
	let manage_a_queue = function(){
		if(options.groupingConstant === 0){
			aritmetic_queue.forEach(ele => {
				if(ele === "1"){
					writeBitNative(1)
				}
				else if(ele === "0"){
					writeBitNative(0)
				}
				else{
					writeByteNative(ele)
				}
			})
			return
		}
		let integers = aritmetic_queue.filter(ele => !(ele === "1" || ele === "0"));
		let maxbo = 0;
		for(let i=1;i<integers.length;i++){
			if(
				(integers[i - 1] === 0 && integers[i] === 255)
				|| (integers[i] === 0 && integers[i - 1] === 255)
			){
				continue
			}
			maxbo = Math.max(maxbo,Math.abs(integers[i - 1] - integers[i]))
		};
		
		if(maxbo > 63){
			stats.chunking.fail++;
			writeBitNative(0);writeBitNative(0);
			aritmetic_queue.forEach(ele => {
				if(ele === "1"){
					writeBitNative(1)
				}
				else if(ele === "0"){
					writeBitNative(0)
				}
				else{
					writeByteNative(ele)
				}
			})
		}
		else if(maxbo > 31){
			stats.chunking.one++;
			writeBitNative(0);writeBitNative(1);
			let funne = false;
			let forige;
			aritmetic_queue.forEach(ele => {
				if(ele === "1"){
					writeBitNative(1)
				}
				else if(ele === "0"){
					writeBitNative(0)
				}
				else if(!funne){
					writeByteNative(ele);
					funne = true;
					forige = ele
				}
				else{
					if(
						(ele === 0 && forige === 255)
						|| (forige === 0 && ele === 255)
					){
						writeBitNative(1);
						stats.negative_zero_abuse++;
						rePlex(0,6).forEach(bit => writeBitNative(bit));
					}
					else{
						if(ele < forige){
							writeBitNative(1)
						}
						else{
							writeBitNative(0)
						}
						rePlex(Math.abs(ele - forige),6).forEach(bit => writeBitNative(bit));
					}
					forige = ele;
				}
			})
		}
		else if(maxbo > 15){
			stats.chunking.two++;
			writeBitNative(1);writeBitNative(0);
			let funne = false;
			let forige;
			aritmetic_queue.forEach(ele => {
				if(ele === "1"){
					writeBitNative(1)
				}
				else if(ele === "0"){
					writeBitNative(0)
				}
				else if(!funne){
					writeByteNative(ele);
					funne = true;
					forige = ele
				}
				else{
					if(
						(ele === 0 && forige === 255)
						|| (forige === 0 && ele === 255)
					){
						writeBitNative(1);
						stats.negative_zero_abuse++;
						rePlex(0,5).forEach(bit => writeBitNative(bit));
					}
					else{
						if(ele < forige){
							writeBitNative(1)
						}
						else{
							writeBitNative(0)
						}
						rePlex(Math.abs(ele - forige),5).forEach(bit => writeBitNative(bit));
					}
					forige = ele;
				}
			})
		}
		else{
			stats.chunking.three++;
			writeBitNative(1);writeBitNative(1);
			let funne = false;
			let forige;
			aritmetic_queue.forEach(ele => {
				if(ele === "1"){
					writeBitNative(1)
				}
				else if(ele === "0"){
					writeBitNative(0)
				}
				else if(!funne){
					writeByteNative(ele);
					funne = true;
					forige = ele
				}
				else{
					if(
						(ele === 0 && forige === 255)
						|| (forige === 0 && ele === 255)
					){
						writeBitNative(1);
						stats.negative_zero_abuse++;
						rePlex(0,4).forEach(bit => writeBitNative(bit));
					}
					else{
						if(ele < forige){
							writeBitNative(1)
						}
						else{
							writeBitNative(0)
						}
						rePlex(Math.abs(ele - forige),4).forEach(bit => writeBitNative(bit));
					}
					forige = ele;
				}
			})
		}
	}
	let writeBit = function(integer){
		if(integer === 1){
			aritmetic_queue.push("1")
		}
		else{
			aritmetic_queue.push("0")
		}
	}
	let writeByte = function(integer){
		aritmetic_queue.push(integer);
		colour_byte_counter++;
		if(colour_byte_counter === (options.groupingConstant || 8)){
			manage_a_queue();
			colour_byte_counter = 0;
			aritmetic_queue = []
		}
	}
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
	writeByteNative(options.groupingConstant);

	function grower(num){
		return Math.max(num - num*num/512,1)
	}

	let error_compare = function(chunck1,chunck2,offx,offy){
		let sumError = 0;
		for(let i=0;i<chunck1.length;i++){
			for(let j=0;j<chunck1[i].length;j++){
				if(offx + i < width && offy + j < height){
					sumError += Math.pow(
						Math.abs(
							chunck2[i][j] - chunck1[i][j]
						)/grower(Math.max(
							chunck1[i][j],
							chunck2[i][j]
						)),
						2
					)
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

	let blockQueue = [{x: 0,y:0, size: encoding_size}];

	if(options.quantizer === 0){
		options.forceGradients = false//useless in lossless mode
	}
	if(!options.hasOwnProperty("maxBlockSize")){//use a sane limit, if no limit provided
		options.maxBlockSize = 128
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
			writeByte(imageData[curr.x][curr.y]);
			stats.single++;
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
			writeBit(0);writeBit(0);
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
				x: curr.x,
				y: curr.y + curr.size/2,
				size: curr.size/2
			})
			blockQueue.push({
				x: curr.x + curr.size/2,
				y: curr.y + curr.size/2,
				size: curr.size/2
			});
			continue
		}
		let chunck = get_chunck(curr.x,curr.y,curr.size);
		let average = find_average(chunck);
		let avg_error = error_compare(chunck,create_uniform(average,curr.size),curr.x,curr.y);
		let localQuantizer = options.quantizer * (1 - Math.sqrt(curr.size/encoding_size));
		if(avg_error <= localQuantizer){
			let partialA = error_compare(get_chunck(curr.x,curr.y,curr.size/2),create_uniform(average,curr.size/2),curr.x,curr.y);
			let partialB = error_compare(get_chunck(curr.x + curr.size/2,curr.y,curr.size/2),create_uniform(average,curr.size/2),curr.x + curr.size/2);
			let partialC = error_compare(get_chunck(curr.x,curr.y + curr.size/2,curr.size/2),create_uniform(average,curr.size/2),curr.x,curr.y + curr.size/2);
			let partialD = error_compare(get_chunck(curr.x + curr.size/2,curr.y + curr.size/2,curr.size/2),create_uniform(average,curr.size/2),curr.x + curr.size/2);
			if(Math.max(partialA,partialB,partialC,partialD) <= 1 * options.quantizer){
				writeBit(0);writeBit(1);
				writeByte(average);
				stats.whole++;
				continue
			}
		}
		if(curr.size >=4){
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
			let orto_error = Math.min(horizontal_error,vertical_error);
			let dia_error = Math.min(diagonal1_error,diagonal2_error);
			if(orto_error < dia_error){
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
						writeBit(1);writeBit(0);
						writeBit(0);
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
						writeBit(1);writeBit(0);
						writeBit(1);
						writeByte(left);
						writeByte(right);
						stats.horizontal++;
						continue
					}
				}
			}
			else{
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
						writeBit(1);writeBit(1);
						writeBit(0);
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
						writeBit(1);writeBit(1);
						writeBit(1);
						writeByte(NE);
						writeByte(SW);
						stats.diagonal++;
						continue
					}
				}
			}
		}
		if(curr.size === 2){
			if(
				chunck[0][0] === chunck[1][0]
				&& chunck[0][1] === chunck[1][1]
			){
				writeBit(1);writeBit(0);
				writeBit(0);
				writeByte(chunck[0][0]);
				writeByte(chunck[0][1]);
				stats.small_gradients++;
				continue
			}
			if(
				chunck[0][0] === chunck[0][1]
				&& chunck[1][0] === chunck[1][1]
			){
				writeBit(1);writeBit(0);
				writeBit(1);
				writeByte(chunck[0][0]);
				writeByte(chunck[1][1]);
				stats.small_gradients++;
				continue
			}
			let dia1_err = error_compare(create_diagonal_gradient(chunck[0][0],chunck[1][1],false,2),chunck,0,0);
			if(dia1_err === 0){
				writeBit(1);writeBit(1);
				writeBit(0);
				writeByte(chunck[0][0]);
				writeByte(chunck[1][1]);
				stats.small_diagonals++;
				continue
			}
			let dia2_err = error_compare(create_diagonal_gradient(chunck[1][0],chunck[0][1],true,2),chunck,0,0);
			if(dia2_err === 0){
				writeBit(1);writeBit(1);
				writeBit(1);
				writeByte(chunck[1][0]);
				writeByte(chunck[0][1]);
				stats.small_diagonals++;
				continue
			}
			if(options.lossySmallGradients){
				let upper_avg = Math.round((chunck[0][0] + chunck[1][0])/2);
				let lower_avg = Math.round((chunck[0][1] + chunck[1][1])/2);
				let left_avg = Math.round((chunck[0][0] + chunck[0][1])/2);
				let right_avg = Math.round((chunck[1][0] + chunck[1][1])/2);
				let lossyVerticalError = error_compare([[upper_avg,lower_avg],[upper_avg,lower_avg]],chunck,0,0);
				let lossyHorizontalError = error_compare([[left_avg,left_avg],[right_avg,right_avg]],chunck,0,0);
				if(Math.min(lossyVerticalError,lossyHorizontalError) < Math.min(dia1_err,dia2_err)){
					if(lossyVerticalError < lossyHorizontalError){
						if(lossyVerticalError <= options.quantizer){
							writeBit(1);writeBit(0);
							writeBit(0);
							writeByte(upper_avg);
							writeByte(lower_avg);
							stats.lossy_small_gradients++;
							continue
						}
					}
					else{
						if(lossyHorizontalError <= options.quantizer){
							writeBit(1);writeBit(0);
							writeBit(1);
							writeByte(left_avg);
							writeByte(right_avg);
							stats.lossy_small_gradients++;
							continue
						}
					}
				}
				else{
					if(dia1_err < dia2_err){
						if(dia1_err <= options.quantizer){
							writeBit(1);writeBit(1);
							writeBit(0);
							writeByte(chunck[0][0]);
							writeByte(chunck[1][1]);
							stats.lossy_small_diagonals++;
							continue
						}
					}
					else{
						if(dia2_err <= options.quantizer){
							writeBit(1);writeBit(1);
							writeBit(1);
							writeByte(chunck[1][0]);
							writeByte(chunck[0][1]);
							stats.lossy_small_diagonals++;
							continue
						}
					}
				}
			}
		}
		//subdivide
		if(curr.size === 1){
			console.log(avg_error)
			throw "should never happen"
		}
		writeBit(0);writeBit(0);
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
			x: curr.x,
			y: curr.y + curr.size/2,
			size: curr.size/2
		})
		blockQueue.push({
			x: curr.x + curr.size/2,
			y: curr.y + curr.size/2,
			size: curr.size/2
		})
	}

	if(aritmetic_queue.length){
		stats.chunking.fail++;
		writeBitNative(0);writeBitNative(0);
		aritmetic_queue.forEach(ele => {
			if(ele === "1"){
				writeBitNative(1)
			}
			else if(ele === "0"){
				writeBitNative(0)
			}
			else{
				writeByteNative(ele)
			}
		})
	}

	while(bitBuffer.length){
		writeBitNative(0)
	}
	let t1 = performance.now();
	stats.time = (t1 - t0);
	stats.size = hohData.length;
	if(hohStatsHandler){
		hohStatsHandler(stats)
	}
	console.log(stats)
	
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

	let groupingConstant = readByteNative();
	console.log(width,height);

	let integersRemaining;
	let integerLength;
	let forige;
	let initializeBlock = function(){
		let head1 = readBit();
		let head2 = readBit();
		if(head1 === 0 && head2 === 0){
			integerLength = 8
		}
		else if(head1 === 0 && head2 === 1){
			integerLength = 7
		}
		else if(head1 === 1 && head2 === 0){
			integerLength = 6
		}
		else{
			integerLength = 5
		}
		integersRemaining = groupingConstant
	};
	if(groupingConstant){
		initializeBlock();
	}
	let readByte = function(){
		if(groupingConstant === 0){
			return readByteNative()
		}
		if(bitBuffer.length < 8 && currentIndex < hohData.length){
			bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
		}
		let byte;
		if(integersRemaining === groupingConstant || integerLength === 8){
			byte = dePlex(bitBuffer.splice(0,8))
		}
		else if(integerLength === 7){
			let sign = 1;
			if(readBit()){
				sign = -1
			}
			let matiss = dePlex(bitBuffer.splice(0,6));
			if(matiss === 0 && sign === -1){
				if(forige === 0){
					byte = 255
				}
				else{
					byte = 0
				}
			}
			else{
				byte = forige + sign * matiss
			}
		}
		else if(integerLength === 6){
			let sign = 1;
			if(readBit()){
				sign = -1
			}
			let matiss = dePlex(bitBuffer.splice(0,5));
			if(matiss === 0 && sign === -1){
				if(forige === 0){
					byte = 255
				}
				else{
					byte = 0
				}
			}
			else{
				byte = forige + sign * matiss
			}
		}
		else{
			let sign = 1;
			if(readBit()){
				sign = -1
			}
			let matiss = dePlex(bitBuffer.splice(0,4));
			if(matiss === 0 && sign === -1){
				if(forige === 0){
					byte = 255
				}
				else{
					byte = 0
				}
			}
			else{
				byte = forige + sign * matiss
			}
		}
		forige = byte;
		integersRemaining--;
		if(integersRemaining === 0 && currentIndex < hohData.length){
			initializeBlock()
		}
		return byte
	}

	
	let imageData = [];
	for(let i=0;i<width;i++){
		imageData.push(new Array(height).fill(255))
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
		if(curr.size === 1){
			imageData[curr.x][curr.y] = readByte();
			continue
		}
		let headBit1 = readBit();
		let headBit2 = readBit();
		if(headBit1 === 0 && headBit2 === 1){
			let solid = readByte();
			for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
				for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
					imageData[i][j] = solid
				}
			}
		}
		else if(headBit1 === 1 && headBit2 === 0){
			let direction = readBit();
			if(direction){
				let left = readByte();
				let right = readByte();
				for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
					for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
						imageData[i][j] = Math.round(left + (right - left) * (i - curr.x) /(curr.size - 1))
					}
				}
			}
			else{
				let top = readByte();
				let bottom = readByte();
				for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
					for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
						imageData[i][j] = Math.round(top + (bottom - top) * (j - curr.y) /(curr.size - 1))
					}
				}
			}
		}
		else if(headBit1 === 1 && headBit2 === 1){
			let direction = readBit();
			let colour1 = readByte();
			let colour2 = readByte();
			for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
				for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
					if(direction){
						imageData[i][j] = Math.round(colour1 + (colour2 - colour1) * ((curr.size - (i - curr.x) - 1) + (j - curr.y))/(2*curr.size - 2))
					}
					else{
						imageData[i][j] = Math.round(colour1 + (colour2 - colour1) * ((i - curr.x) + (j - curr.y))/(2*curr.size - 2))
					}
				}
			}
		}
		else if(curr.size > 1){
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
				x: curr.x,
				y: curr.y + curr.size/2,
				size: curr.size/2
			})
			blockQueue.push({
				x: curr.x + curr.size/2,
				y: curr.y + curr.size/2,
				size: curr.size/2
			})
		}
	}

	return imageData
}











