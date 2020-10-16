function rgba_to_yiqa(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = R - B;
		let Cg = G - ((R + B)>>1);

		outBuffer[i] = Y;
		outBuffer[i + 1] = Co + 255;
		outBuffer[i + 2] = Cg + 255;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function rgb_to_yiq(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = R - B;
		let Cg = G - ((R + B)>>1);

		outBuffer[i] = Y;
		outBuffer[i + 1] = Co + 255;
		outBuffer[i + 2] = Cg + 255
	}
	return outBuffer
}

function rgba_to_subgreena(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let G = imageData[i + 1];
		let Rg = imageData[i] - G;
		let Bg = imageData[i + 2] - G;

		outBuffer[i] = G;
		outBuffer[i + 1] = Rg + 255;
		outBuffer[i + 2] = Bg + 255;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function multiplexChannels(channelArray){
	let imageData = [];
	let width = channelArray[0].length;
	let height = channelArray[0][0].length;
	for(let j=0;j<height;j++){
		for(let i=0;i<width;i++){
			for(let k=0;k<channelArray.length;k++){
				imageData.push(channelArray[k][i][j])
			}
		}
	}
	return imageData
}

function deMultiplexChannels(imageData,width,height){
	let channelArray = [];
	let channelNumber = imageData.length/(width * height);
	if(channelNumber !== Math.round(channelNumber)){
		throw "invalid image data"
	}
	for(let i=0;i<channelNumber;i++){
		let channel = [];
		for(let j=0;j<width;j++){
			channel.push([])
		}
		channelArray.push(channel);
	}
	for(let i=0;i<height;i++){
		for(let j=0;j<width;j++){
			for(let k=0;k<channelNumber;k++){
				channelArray[k][i][j] = imageData[(j + i*width)*channelNumber + k]
			}
		}
	}
	return channelArray
}

function hasAlpha(imageData,width,height){
	let channelNumber = imageData.length/(width * height);
	if(channelNumber !== Math.round(channelNumber)){
		throw "invalid image data"
	}
	for(let i=3;i<imageData.length;i+=channelNumber){
		if(imageData[i] !== 255){
			return true
		}
	}
	return false
}

function hasColour(imageData,width,height){
	let channelNumber = imageData.length/(width * height);
	if(channelNumber !== Math.round(channelNumber)){
		throw "invalid image data"
	}
	for(let i=0;i<imageData.length;i+=channelNumber){
		if(imageData[i] !== imageData[i+1] || imageData[i] !== imageData[i+2]){
			return true
		}
	}
	return false
}


function rgba_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		outBuffer.push(imageData[i],imageData[i+1],imageData[i+2])
	}
	return outBuffer
}

function deSerialize(imageData,number){
	let channels = new Array(number).fill(0).map(a => []);
	for(let i=0;i<imageData.length;i+=number){
		for(let j=0;j<number;j++){
			channels[j].push(imageData[i+j])
		}
	}
	return channels
}