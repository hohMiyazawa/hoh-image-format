const BYTE_LENGTH = 8;

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

function encode_bitimage(data,width,height){
//hist
/*	let buffer_hist = [];
	let writer_hist = {
		write: function(bit){
			buffer_hist.push(bit)
		},
		close: function(){}
	}

	let hist = new FrequencyTable([1,1]);

	let enc_hist = new ArithmeticEncoder(NUM_OF_BITS, writer_hist);
	data.forEach(value => {
		enc_hist.write(hist,value);
		hist.increment(value);
	})
	
	buffer_hist = encodeVarint(buffer_hist.length).concat(buffer_hist);
	enc_hist.finish();*/
//end hist

// 2x2
/*	let buffer_block = [];
	let writer_block = {
		write: function(bit){
			buffer_block.push(bit)
		},
		close: function(){}
	}

	let block = new FrequencyTable(new Array(16).fill(1));

	let enc_block = new ArithmeticEncoder(NUM_OF_BITS, writer_block);
	for(let j=0;j<height;j += 2){
		for(let i=0;i<width;i += 2){
			let val;
			if(i + 1 < width && j + 1 < height){
				val = (data[j*width + i] << 3) + (data[j*width + i + 1] << 2) + (data[j*width + i + width] << 1) + data[j*width + i + width + 1];
			}
			else if(j + 1 < height){
				val = (data[j*width + i] << 3) + (data[j*width + i + width] << 1)
			}
			else if(i + 1 < width){
				val = (data[j*width + i] << 3) + (data[j*width + i + 1] << 2)
			}
			else{
				val = (data[j*width + i] << 3)
			}
			try{
				enc_block.write(block,val);
			}
			catch(e){
				console.log(val,i,j,width,height);
				console.log(data[j*width + i],data[j*width + i + 1],data[j*width + i + width],data[j*width + i + width + 1])
				throw "lad"
			}
			block.increment(val)
		}
	}
	enc_block.finish();

	buffer_block= encodeVarint(buffer_block.length).concat(buffer_block);*/
// end 2x2

// 2x2 pred
/*	let buffer_block2 = [];
	let writer_block2 = {
		write: function(bit){
			buffer_block2.push(bit)
		},
		close: function(){}
	}

	let block2 = new Array(16).fill(0).map(_ => new FrequencyTable(new Array(16).fill(1)));

	let enc_block2 = new ArithmeticEncoder(NUM_OF_BITS, writer_block2);
	let forige = 0;
	for(let j=0;j<height;j += 2){
		for(let i=0;i<width;i += 2){
			let val;
			if(i + 1 < width && j + 1 < height){
				val = (data[j*width + i] << 3) + (data[j*width + i + 1] << 2) + (data[j*width + i + width] << 1) + data[j*width + i + width + 1];
			}
			else if(j + 1 < height){
				val = (data[j*width + i] << 3) + (data[j*width + i + width] << 1)
			}
			else if(i + 1 < width){
				val = (data[j*width + i] << 3) + (data[j*width + i + 1] << 2)
			}
			else{
				val = (data[j*width + i] << 3)
			}
			enc_block2.write(block2[forige],val);
			block2[forige].increment(val);
			forige = val;
		}
	}
	enc_block2.finish();


	buffer_block= encodeVarint(buffer_block.length).concat(buffer_block);*/
// end 2x2 pred

//quad

	let buffer_quad = [];
	let writer_quad = {
		write: function(bit){
			buffer_quad.push(bit)
		},
		close: function(){}
	}
	let enc_quad = new ArithmeticEncoder(NUM_OF_BITS, writer_quad);

	let encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));

	let quad = new Array(16).fill(0).map(_ => new FrequencyTable(new Array(16).fill(1)));
	let forige_quad = 0;

	let quad_split = new FrequencyTable([1,1]);
	let quad_whole = new FrequencyTable([1,1]);
	let quad_whole_black = new FrequencyTable([1,1]);
	let quad_whole_white = new FrequencyTable([1,1]);
	let quad_bit_forige = 0;

	let blockQueue = [{x: 0,y:0, size: encoding_size}];
	while(blockQueue.length){
		let curr = blockQueue.pop();
		if(
			curr.x >= width
			|| curr.y >= height
		){
			continue
		}
		if(curr.size === 2){
			let val;
			if(curr.x + 1 < width && curr.y + 1 < height){
				val = (data[curr.y * width + curr.x] << 3)
				+ (data[curr.y * width + curr.x + 1] << 2)
				+ (data[curr.y * width + curr.x + width] << 1)
				+  data[curr.y * width + curr.x + width + 1];
			}
			else if(curr.y + 1 < height){
				val = (data[curr.y * width + curr.x] << 3) + (data[curr.y * width + curr.x + width] << 1)
			}
			else if(curr.x + 1 < width){
				val = (data[curr.y * width + curr.x] << 3) + (data[curr.y * width + curr.x + 1] << 2)
			}
			else{
				val = (data[curr.y * width + curr.x] << 3)
			}
			enc_quad.write(quad[forige_quad],val);
			quad[forige_quad].increment(val);
			forige_quad = val;
			continue;
		}
		let col = data[curr.y * width + curr.x];
		let found = true;
		for(let i=0;i<curr.size && i < width - curr.x;i++){
			for(let j=0;j<curr.size && j < height - curr.y && found;j++){
				if(data[(curr.y + j) * width + (curr.x + i)] !== col){
					found = false;
					break;
				}
			}
		}
		if(found){
			enc_quad.write(quad_split,1);
			quad_split.increment(1);
			//enc_quad.write(quad_whole,col);
			//quad_whole.increment(col);
			if(quad_bit_forige === 0){
				enc_quad.write(quad_whole_black,col);
				quad_whole_black.increment(col);
			}
			else{
				enc_quad.write(quad_whole_white,col);
				quad_whole_white.increment(col);
			}
			quad_bit_forige = col;
			continue;
		}

		enc_quad.write(quad_split,0);
		quad_split.increment(0);
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
	enc_quad.finish();

//quad

	//console.log("histogram",buffer_hist.length/8);
	//console.log("block",buffer_block.length/8);
	//console.log("block2",buffer_block2.length/8);
	console.log("quad",buffer_quad.length/8);
	//console.log("raw",data.length/8);

	return buffer_quad
}

function decode_bitimage(data,width,height){
	let decodedData = new Array(width*height).fill(0);

	let buffer_quad = [];
	let debug_reads = 0;
	let reader = {
		read: function(){
			if(debug_reads <= data.length){
				return data[debug_reads++]
			}
			else{
				return -1
			}
		},
		close: function(){}
	}
	let dec = new ArithmeticDecoder(NUM_OF_BITS, reader);

	let encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));

	let quad = new Array(16).fill(0).map(_ => new FrequencyTable(new Array(16).fill(1)));
	let forige_quad = 0;

	let quad_split = new FrequencyTable([1,1]);
	let quad_whole = new FrequencyTable([1,1]);
	let quad_whole_black = new FrequencyTable([1,1]);
	let quad_whole_white = new FrequencyTable([1,1]);
	let quad_bit_forige = 0;

	let blockQueue = [{x: 0,y:0, size: encoding_size}];
	while(blockQueue.length){
		let curr = blockQueue.pop();
		if(
			curr.x >= width
			|| curr.y >= height
		){
			continue
		}
		if(curr.size === 2){
			let val = dec.read(quad[forige_quad]);
			quad[forige_quad].increment(val);
			forige_quad = val;
			decodedData[curr.y*width + curr.x] = val >> 3;
			if(curr.x + 1 < width){
				decodedData[curr.y*width + curr.x + 1] = (val % 8) >> 2;
			}
			if(curr.y + 1 < height){
				decodedData[(curr.y+1)*width + curr.x] = (val % 4) >> 1;
			}
			if(curr.x + 1 < width && curr.y + 1 < height){
				decodedData[(curr.y+1)*width + curr.x+1] = val % 2;
			}
			continue;
		}

		let splitting = dec.read(quad_split);
		quad_split.increment(splitting);

		if(splitting === 1){
			let colour;
			if(quad_bit_forige === 0){
				colour = dec.read(quad_whole_black);
				quad_whole_black.increment(colour);
			}
			else{
				colour = dec.read(quad_whole_white);
				quad_whole_white.increment(colour);
			}
			if(colour){
				for(let i=0;i<curr.size && curr.x + i < width;i++){
					for(let j=0;j<curr.size && curr.y + j < height;j++){
						decodedData[(curr.y + j)*width + i + curr.x] = 1
					}
				}
			}
			quad_bit_forige = colour;
		}
		else{
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
	}
	return decodedData
}
