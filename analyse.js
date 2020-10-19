let entropy = function(vals){
	return Math.log2(vals)
}

let analyse = function(data,info,options){
	data2 = rgba_to_yiqa(data);
	let channels = deSerialize(data2,4);
	let min_Y = 255;
	let max_Y = 0;
	channels[0].forEach(val => {
		min_Y = Math.min(min_Y,val);
		max_Y = Math.max(max_Y,val);
	});
	let ent = 0;
	console.log("Y","min",min_Y,"max",max_Y);
	ent += entropy(256) + entropy(256 - min_Y);

	let valMap_i = new Array(256).fill(0).map(_ => new Array(511).fill(0));
	channels[0].forEach((val,index) => {
		valMap_i[val][channels[1][index]]++
	})
	let canvas = document.getElementById("render_i");
	canvas.width = 511;
	canvas.height = 256;
	let ctx = canvas.getContext("2d");
	ctx.fillStyle = "white";
	ctx.fillRect(0,0,511,256);
	ctx.fillStyle = "black";

	let writer = {
		write: function(bit){
			ent += 1
		},
		close: function(){}
	}

	/*let freqTabStart_i = new FrequencyTable(new Array(511).fill(1));
	let freqTabEnd_i = new FrequencyTable(new Array(511).fill(1));*/
	//let freqTabStart_i = new FrequencyTable(new Array(511).fill(1));
	//let freqTabEnd_i = new Array(511).fill(1);
	let freqTabStart_i = new Array(511*2-1).fill(1);
	let freqTabEnd_i = new Array(511*2-1).fill(1);

	let enc_i = new ArithmeticEncoder(NUM_OF_BITS, writer);

	let previous_is = 255;
	let previous_il = 255;

	for(let j=0;j<256;j++){
		for(let i=0;i<511;i++){
			if(valMap_i[j][i]){
				ctx.fillRect(i,j,1,1)
			}
		}
		if(j >= min_Y && j <= max_Y){
			let smallest = valMap_i[j].findIndex(a => a);
			smallest = (smallest === -1 ? 255 : smallest);
			let largest = valMap_i[j].map(a => a).reverse().findIndex(a => a);
			largest =  510 - (largest === -1 ? 255 : largest);

			//enc_i.write(freqTabStart_i,smallest);
			//enc_i.write(freqTabEnd_i,largest);
			//enc_i.write(new FrequencyTable(freqTabEnd_i.map((e,i) => i < smallest ? 0 : e)),largest);
			//freqTabStart_i.increment(smallest);
			//freqTabEnd_i.increment(largest);
			//freqTabEnd_i[largest]++;

			/*let smallest_s = smallest - previous_is + 511;
			let largest_s = largest - previous_il + 511;

			enc_i.write(freqTabStart_i,smallest_s);
			enc_i.write(freqTabEnd_i,largest_s);
			freqTabStart_i.increment(smallest_s);
			freqTabEnd_i.increment(largest_s);
			previous_is = smallest;
			previous_il = largest;*/

			let smallest_s = smallest - previous_is + 511;
			let largest_s = largest - previous_il + 511;

			enc_i.write(new FrequencyTable(freqTabStart_i.map((e,i) => {
				if(
					(i - 511) + previous_is <= 511
					&& (i - 511) + previous_is >= 0
				){
					return e
				}
				else{
					return 0
				}
			})),smallest_s);
			enc_i.write(new FrequencyTable(freqTabEnd_i.map((e,i) => {
				if(
					(i - 511) + previous_il <= 511
					&& (i - 511) + previous_il >= 0
					&& (i - 511) + previous_il >= smallest
				){
					return e
				}
				else{
					return 0
				}
			})),largest_s);

			freqTabStart_i[smallest_s]++;
			freqTabEnd_i[largest_s]++;
			previous_il = largest;
			previous_is = smallest;
		}
	}

	console.log(freqTabStart_i);

	enc_i.finish();

	/*ctx.fillStyle = "blue";
	for(let j=0;j<256;j++){
		for(let i=0;i<511;i++){
			if(valMap_i[j][i] >= (info.width*info.height)/10000){
				ctx.fillRect(i,j,1,1)
			}
		}
	}
	ctx.fillStyle = "red";
	for(let j=0;j<256;j++){
		for(let i=0;i<511;i++){
			if(valMap_i[j][i] >= (info.width*info.height)/1000){
				ctx.fillRect(i,j,1,1)
			}
		}
	}*/

	let valMap_q = new Array(256).fill(0).map(_ => new Array(511).fill(0));
	channels[0].forEach((val,index) => {
		valMap_q[val][channels[2][index]]++
	})
	canvas = document.getElementById("render_q");
	canvas.width = 511;
	canvas.height = 256;
	ctx = canvas.getContext("2d");
	ctx.fillStyle = "white";
	ctx.fillRect(0,0,511,256);
	ctx.fillStyle = "black";


	//let freqTabStart_q = new FrequencyTable(new Array(511).fill(1));
	//let freqTabEnd_q = new FrequencyTable(new Array(511).fill(1));
	//let freqTabEnd_q = new Array(511).fill(1);

	let enc_q = new ArithmeticEncoder(NUM_OF_BITS, writer);

	let freqTabStart_q = new Array(511*2-1).fill(1);
	let freqTabEnd_q = new Array(511*2-1).fill(1);

	let previous_qs = 255;
	let previous_ql = 255;


	for(let j=0;j<256;j++){
		for(let i=0;i<511;i++){
			if(valMap_q[j][i]){
				ctx.fillRect(i,j,1,1)
			}
		}
		if(j >= min_Y && j <= max_Y){
			let smallest = valMap_q[j].findIndex(a => a);
			smallest = (smallest === -1 ? 255 : smallest);
			let largest = valMap_q[j].map(a => a).reverse().findIndex(a => a);
			largest =  510 - (largest === -1 ? 255 : largest);
			//ent += entropy(511) + entropy(511 - smallest);
			//enc_q.write(freqTabStart_q,smallest);
			//enc_q.write(freqTabEnd_q,largest);
			//enc_q.write(new FrequencyTable(freqTabEnd_q.map((e,i) => i < smallest ? 0 : e)),largest);
			//freqTabStart_q.increment(smallest);
			//freqTabEnd_q.increment(largest);
			//freqTabEnd_q[largest]++;
			let smallest_s = smallest - previous_qs + 511;
			let largest_s = largest - previous_ql + 511;

			enc_q.write(new FrequencyTable(freqTabStart_q.map((e,i) => {
				if(
					(i - 511) + previous_qs <= 511
					&& (i - 511) + previous_qs >= 0
				){
					return e
				}
				else{
					return 0
				}
			})),smallest_s);
			enc_q.write(new FrequencyTable(freqTabEnd_q.map((e,i) => {
				if(
					(i - 511) + previous_ql <= 511
					&& (i - 511) + previous_ql >= 0
					&& (i - 511) + previous_ql >= smallest
				){
					return e
				}
				else{
					return 0
				}
			})),largest_s);

			freqTabStart_q[smallest_s]++;
			freqTabEnd_q[largest_s]++;
			previous_ql = largest;
			previous_qs = smallest;
		}
	}

	enc_q.finish();

	/*ctx.fillStyle = "blue";
	for(let j=0;j<256;j++){
		for(let i=0;i<511;i++){
			if(valMap_q[j][i] >= (info.width*info.height)/10000){
				ctx.fillRect(i,j,1,1)
			}
		}
	}
	ctx.fillStyle = "red";
	for(let j=0;j<256;j++){
		for(let i=0;i<511;i++){
			if(valMap_q[j][i] >= (info.width*info.height)/1000){
				ctx.fillRect(i,j,1,1)
			}
		}
	}*/
	console.log("entropy",ent/8);
	document.getElementById("rangecost").innerText = "range-only encoding cost: " + Math.ceil(ent/8) + " bytes";


	let valMap_iq = new Array(511).fill(0).map(_ => new Array(511).fill(0));
	channels[1].forEach((val,index) => {
		valMap_iq[val][channels[2][index]]++
	})
	canvas = document.getElementById("render_chroma");
	canvas.width = 511;
	canvas.height = 511;
	ctx = canvas.getContext("2d");
	ctx.fillStyle = "white";
	ctx.fillRect(0,0,511,511);
	ctx.fillStyle = "black";
	for(let j=0;j<511;j++){
		for(let i=0;i<511;i++){
			if(valMap_iq[j][i]){
				ctx.fillRect(i,j,1,1)
			}
		}
	}

	console.info("Y-I bitimage");
	let cost1 = encode_bitimage(valMap_i.flat().map(a => +!!a),511,256).length/8;
	console.info("Y-Q bitimage");
	let cost2 = encode_bitimage(valMap_q.flat().map(a => +!!a),511,256).length/8;
	console.info("I-Q bitimage");
	let cost3= encode_bitimage(valMap_iq.flat().map(a => +!!a),511,511).length/8;
	console.log("full cost",cost1 + cost2 + cost3);
	document.getElementById("bitimage1").innerText = "cost: " + Math.ceil(cost1) + " bytes";
	document.getElementById("bitimage2").innerText = "cost: " + Math.ceil(cost2) + " bytes";
	document.getElementById("bitimage3").innerText = "cost: " + Math.ceil(cost3) + " bytes";
}
