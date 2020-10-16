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

	let chances = new Array(range).fill(1);

	let dec = new ArithmeticDecoder(NUM_OF_BITS, reader);

	let decodedData = [];
	for(let i=0;i<width*height;i++){
		let localChances = [];
		localChances = chances;
		let value = dec.read(
			new FrequencyTable(localChances)
		)
		decodedData.push(value);
		chances[value]++
	}

	return decodedData
}
