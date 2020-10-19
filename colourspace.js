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

function rgb_to_greyscale(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];

		outBuffer.push(Math.round((R+2*G+B)/4))
	}
	return outBuffer
}

function greyscale_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i++){
		outBuffer.push(imageData[i],imageData[i],imageData[i])
	}
	return outBuffer
}

function yiq_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let Y = imageData[i];
		let Co = imageData[i + 1] - 255;
		let Cg = imageData[i + 2] - 255;
		let G = Y - ((-Cg)>>1);
		let B = Y + ((1-Cg)>>1) - (Co>>1);
		let R = Co + B;

		outBuffer.push(R,G,B)
	}
	return outBuffer
}

/*
function Q_limits_from_y(Y){
	return {
		min: Math.max(-(Y*2 + 1),-(255 - Y)*2,-255) + 255,
		max: Math.min((255 - Y)*2,Y*2 + 1,255) + 255
	}
}

function I_limits_from_y(Y){
	return {
		min: (- 1 - Y) + 255,
		max: 510
	}
}*/
const Y_I_lower = new Array(256).fill(0).map((_,index) => {
	if(index < 64){
		return 252 - index*4
	}
	if(index >= 192){
		return 3 + (index - 192)*4
	}
	return 0
});
const Y_I_upper = new Array(256).fill(0).map((_,index) => {
	if(index < 64){
		return 260 + index*4
	}
	if(index >= 192){
		return 507 - (index - 192)*4
	}
	return 510
});
const Y_Q_lower = new Array(256).fill(0).map((_,index) => {
	if(index < 128){
		return 254 - index*2
	}
	return 1 + (index - 128)*2
});
const Y_Q_upper = new Array(256).fill(0).map((_,index) => {
	if(index < 128){
		return 256 + index*2
	}
	return 509 - (index - 128)*2
});


function yiq_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let Y = imageData[i];
		let Co = imageData[i + 1] - 255;
		let Cg = imageData[i + 2] - 255;
		let G = Y - ((-Cg)>>1);
		let B = Y + ((1-Cg)>>1) - (Co>>1);
		let R = Co + B;

		outBuffer.push(R,G,B,255)
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

function serialize(channels){
	let outBuffer = [];
	for(let i=0;i<channels[0].length;i++){
		channels.forEach(channel => {
			outBuffer.push(channel[i])
		})
	}
	return outBuffer
}

function getPatch(imageData,ww,hh,x,y,width,height){
	if(x >= ww || y >= hh || x + width > ww || y + height > hh){
		console.log(ww,hh,x,y,width,height);
		throw "bad patch dimensions"
	}
	if(x === 0 && y === 0 && ww === width && hh === height){
		return imageData
	}
	let channels = imageData.length/(ww*hh);
	let patch = [];
	for(let i=0;i<height;i++){
		let offset = ((y+i) * ww + x)*channels;
		patch = patch.concat(imageData.slice(offset,offset + width*channels))
	}
	return patch
}

function check_index(imageData,limit){
	let list = [];
	const index_limit = Math.min(limit,imageData.length/6);
	for(let i=0;i<imageData.length;i += 3){
		if(
			!list.find(
				ele => ele[0] === imageData[i + 0]
					&& ele[1] === imageData[i + 1]
					&& ele[2] === imageData[i + 2]
			)
		){
			list.push(
				[imageData[i + 0],imageData[i + 1],imageData[i + 2]]
			)
		}
		if(list.length > index_limit){
			return null
		}
	}
	return list
}

function check_indexa(imageData,limit,full){
	let list = [];
	const index_limit = Math.min(limit,imageData.length/8)
	for(let i=0;i<imageData.length;i += 4){
		if(
			!list.find(
				ele => (ele[0] === imageData[i + 0]
					&& ele[1] === imageData[i + 1]
					&& ele[2] === imageData[i + 2]
					&& ele[3] === imageData[i + 3]) || (full && ele[3] === 0 && imageData[i + 3] === 0)
			)
		){
			list.push(
				[imageData[i + 0],imageData[i + 1],imageData[i + 2],imageData[i + 3]]
			)
		}
		if(list.length > index_limit){
			return null
		}
	}
	return list
}

function rgb_to_indexed(imageData,index){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		outBuffer.push(index.findIndex(
			ele => ele[0] === imageData[i + 0]
				&& ele[1] === imageData[i + 1]
				&& ele[2] === imageData[i + 2]
		))
	}
	return outBuffer
}
