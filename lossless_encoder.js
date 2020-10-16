let encodeChannel_lossless = function(data,channel_options,global_options,context_data){
	console.info("Encoding",channel_options.name);
	const width = channel_options.width;
	const height = channel_options.height;
	const range = channel_options.range;

	let dataBuffer = [];
	let writer = {
		write: function(bit){
			dataBuffer.push(bit)
		},
		close: function(){}
	}

	let chances = new Array(range).fill(1);

	let enc = new ArithmeticEncoder(NUM_OF_BITS, writer);
	data.forEach((value,index) => {
		let localChances = [];
		localChances = chances;
		let total = 0;
		let getLow;
		let getHigh;
		for(let i=0;i<localChances.length;i++){
			if(value === i){
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
			value
		)
		chances[value]++
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
