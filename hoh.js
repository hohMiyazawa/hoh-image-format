const BYTE_LENGTH = 8;
const BYTE_POWER = Math.pow(2,BYTE_LENGTH);
const BYTE_MAX_VAL = BYTE_POWER - 1;

const CACHE_SIZE = 20000
const NUM_OF_BITS = 31


//arith adopted from https://github.com/upupming/arithmetic-coding

class FrequencyTable {
  /**
   * Constructs a simple frequency table in one of two ways:
   * 1. FrequencyTable(array):
   *    Build a frequency table from the given sequence of symbol frequencies
   * 2. FrequencyTable(freqtable):
   *    Builds a frequency table by copying the given frequency table
   */
  constructor (freqs) {
    if (freqs instanceof FrequencyTable) {
      let symbolLimit = freqs.symbolLimit
      this._frequencies = []
      for (let i = 0; i < symbolLimit; i++) {
        this._frequencies[i] = freqs.get(i)
      }
    } else { // Assume it is an array sequence
      this._frequencies = Array.from(freqs)
    }

    // `_frequencies` is an array of the frequency for each symbol.
    // Its length is at least 1, ans each element is non-negative.
    if (this._frequencies.length < 1) {
      throw new Error('At least 1 symbol needed')
    }
    this._frequencies.forEach(freq => {
      if (freq < 0) {
        throw new RangeError('Negative frequency')
      }
    })

    // Always equal to the sum of `frequencies`
    this._total = this._frequencies.reduce((partialSum, a) => partialSum + a)

    // _cumulative[i] is the sum of `frequencies` in range [0, i)
    // Initialized lazily. When it is no None, the data is valid.
    this._cumulative = null
  }

  /**
   * Returns the number of symbols in this frequencies table,
   * which is at least 1.
   */
  get symbolLimit () {
    return this._frequencies.length
  }
  /**
   * Returns the total of all symbol frequencies.
   * The returned value is at least 0 and is always equal to
   * `getHigh(symbolLimit - 1)`
   */
  get total () {
    // console.log(this._frequencies.toString());
    return this._total
  }
  /**
   * Returns the sum of the frequencies of all the symbols strictly
   * below the given symbol value.
   * The returned value is at least 0.
   */
  getLow (symbol) {
    if (symbol === 0) return 0
    this._checkSymbol(symbol - 1)
    if (this._cumulative === null) {
      this._initCumulative()
    }
    return this._cumulative[symbol - 1]
  }
  /**
   * Returns the sum of the frequencies of the given symbol and all the
   * symbols below the given symbol value.
   * The returned value is at least 0.
   */
  getHigh (symbol) {
    this._checkSymbol(symbol)
    if (this._cumulative === null) {
      this._initCumulative()
    }
    return this._cumulative[symbol]
  }

  /**
   * Returns the frequency of the given symbol.
   * The returned value is at least 0.
   * @param {number} symbol in range [0, symbolLimit)
   */
  get (symbol) {
    this._checkSymbol(symbol)
    return this._frequencies[symbol]
  }
  /**
   * Sets the frequency of the given symbol to the given value.
   * The frequency value must be at least 0.
   * If an error is thrown, then the state is left unchanged.
   * @param {number} symbol
   * @param {number} freq >= 0
   */
  set (symbol, freq) {
    this._checkSymbol(symbol)
    if (freq < 0) {
      throw new RangeError('Negative frequency')
    }
    let sumFreqOfOthers = this._total - this._frequencies[symbol]
    this._total = sumFreqOfOthers + freq
    this._frequencies[symbol] = freq
    this._cumulative = null
  }
  /**
   * Increments the frequency of the given symbol
   * @param {number} symbol
   */
  increment (symbol) {
    this._checkSymbol(symbol)
    this._total += 1
    this._frequencies[symbol] += 1
    this._cumulative = null
  }
  _checkSymbol (symbol) {
    if (symbol >= 0 && symbol < this._frequencies.length) {

    } else {
      throw new RangeError('Symbol out of range')
    }
  }
  /**
   * Recomputes the array of cumulative symbol frequencies.
   * For example:
   *    if _frequencies = [1, 2, 3, 4]
   *    then _cumulative = [1, 3, 6, 10]
   */
  _initCumulative () {
    let cumul = Array.from(this._frequencies)
    for (let i = 1; i < cumul.length; i++) {
      cumul[i] += cumul[i - 1]
    }
    this._cumulative = cumul
  }
  /**
   * Returns a string representation of this frequency table,
   * useful for debugging only, and the format is subject to change.
   */
  toString () {
    let result = ''
    for (let i = 0; i < this._frequencies.length; i++) {
      result += `${i}\t${this._frequencies[i]}\n`
    }
    return result
  }
}

class Coder {
  constructor (numbits) {
    if (numbits < 1) {
      throw new Error('State size out of range')
    }
    // -- Configuration fields --
    // Number of bits for the 'low' and 'high' state variables. Must be at least 1.
    // - Larger values are generally better - they allow a larger maximum frequency total (maximum_total),
    //   and they reduce the approximation error inherent in adapting fractions to integers;
    //   both effects reduce the data encoding loss and asymptotically approach the efficiency
    //   of arithmetic coding using exact fractions.
    // - But larger state sizes increase the computation time for integer arithmetic,
    //   and compression gains beyond ~30 bits essentially zero in real-world applications.
    // - Python has native bigint arithmetic, so there is no upper limit to the state size.
    //   For Java and C++ where using native machine-sized integers makes the most sense,
    //   they have a recommended value of num_state_bits=32 as the most versatile setting.
    this._num_state_bits = numbits
    // console.log(`this._num_state_bits: ${this._num_state_bits}`);
    // Maximum range (high+1-low) during coding (trivial), which is 2^num_state_bits = 1000...000.
    this._full_range = 1 << numbits >>> 0
    // console.log(`this._full_range: ${this._full_range.toString(16)}`);
    // The top bit at width num_state_bits, which is 0100...000.
    this._half_range = this._full_range >>> 1
    // The second highest bit at width num_state_bits, which is 0010...000. This is zero when num_state_bits=1.
    this._quarter_range = this._half_range >>> 1 // Can be zero
    // Minimum range (high+1-low) during coding (non-trivial), which is 0010...010.
    this._minimum_range = this._quarter_range + 2 // At least 2
    // Maximum allowed total from a frequency table at all times during coding. This differs from Java
    // and C++ because Python's native bigint avoids constraining the size of intermediate computations.
    this._maximum_total = this._minimum_range
    // console.log(`this._maximum_total: ${this._maximum_total.toString(16)}`);
    // Bit mask of num_state_bits ones, which is 0111...111.
    this._state_mask = this._full_range - 1
    // console.log(`this._state_mask: ${this._state_mask.toString(16)}`);

    // -- State fields --
    // Low end of this arithmetic coder's current range. Conceptually has an infinite number of trailing 0s.
    this._low = 0
    // console.log(`this._low: ${this._low.toString(16)}`);
    // High end of this arithmetic coder's current range. Conceptually has an infinite number of trailing 1s.
    this._high = this._state_mask
    // console.log(`this._high: ${this._high.toString(16)}`);
  }

  // Updates the code range (low and high) of this arithmetic coder as a result
  // of processing the given symbol with the given frequency table.
  // Invariants that are true before and after encoding/decoding each symbol
  // (letting full_range = 2^num_state_bits):
  // - 0 <= low <= code <= high < full_range. ('code' exists only in the decoder.)
  //   Therefore these variables are unsigned integers of num_state_bits bits.
  // - low < 1/2 * full_range <= high.
  //   In other words, they are in different halves of the full range.
  // - (low < 1/4 * full_range) || (high >= 3/4 * full_range).
  //   In other words, they are not both in the middle two quarters.
  // - Let range = high - low + 1, then full_range/4 < minimum_range
  //   <= range <= full_range. These invariants for 'range' essentially
  //   dictate the maximum total that the incoming frequency table can have.
  update (freqs, symbol) {
    // State check
    let low = this._low
    let high = this._high
    // console.log(`======== Updating ${symbol} =========`);
    // console.log(`this._low = ${this._low.toString(16)}`);
    // console.log(`this._high = ${this._high.toString(16)}`);
    // console.log(`low & this._state_mask = ${low & this._state_mask.toString(16)}`);
    // console.log(`high & (this._state_mask) = ${high & (this._state_mask).toString(16)}`);
    if (low >>> 0 >= high >>> 0 || ((low & this._state_mask) !== low) || ((high & (this._state_mask)) !== high)) {
      throw new RangeError(`Low or high out of range, low = ${low}, high = ${high}`)
    }
    let range = high - low + 1
    // console.log(`range = ${range.toString(16)}`);
    if (!(this._minimum_range >>> 0 <= range >>> 0 && range >>> 0 <= this._full_range >>> 0)) {
      throw new RangeError('Range out of range')
    }

    // Frequency table values check
    let total = freqs.total
    let symlow = freqs.getLow(symbol)
    let symhigh = freqs.getHigh(symbol)
    // console.log(`symlow = ${symlow.toString(16)}`);
    // console.log(`symhigh = ${symhigh.toString(16)}`);
    if (symlow === symhigh) {
      throw new Error('Symbol has zero frequency')
    }
    if (this._maximum_total >>> 0 <= total >>> 0) {
      throw new Error('Cannot code symbol because total is too large')
    }

    // Update
    // console.log(`total = ${total.toString(16)}`);
    let newlow = low + Math.floor(range * symlow / total)
    let newhigh = low + Math.floor(range * symhigh / total) - 1
    // console.log(`newlow = ${newlow.toString(16)}`);
    // console.log(`newhigh = ${newhigh.toString(16)}`);
    this._low = newlow
    this._high = newhigh

    // While low and high have the same top bit value, shift them out
    while (((this._low ^ this._high) & (this._half_range)) === 0) {
      this._shift()
      this._low = (this._low << 1) & (this._state_mask)
      this._high = (this._high << 1) & (this._state_mask) | 1
    }

    // Now low's top bit must be 0 and high's top bit must be 1

    // While low's top two bits are 01 and high's are 10, delete the second highest bit of both
    while ((this._low & (~this._high) & (this._quarter_range)) !== 0) {
      this._underflow()
      this._low = (this._low << 1) ^ (this._half_range)
      this._high = ((this._high ^ (this._half_range)) << 1) | this._half_range | 1
    }
  }
}

class ArithmeticEncoder extends Coder {
  /**
   *
   * @param {number} numbits
   * @param {BitOutputStream} bitout
   */
  constructor (numbits, bitout) {
    super(numbits)

    // The underlying bit output stream.
    this._output = bitout
    // Number of saved underflow bits. This value can grow without bound.
    this._num_underflow = 0
  }

  /**
   * Encodes the given symbol based on the given frequency table.
   * This updates this arithmetic coder's state and may write out some bits.
   * @param {*} freqs
   * @param {*} symbol
   */
  write (freqs, symbol) {
    // console.log('writing symbol', symbol);
    this.update(freqs, symbol)
  }
  /**
   * Terminates the arithmetic coding by flushing any buffered bits, so that the output can be decoded properly.
   * It is important that this method must be called at the end of the each encoding process.
   * Note that this method merely writes data to the underlying output stream but does not close it.
   */
  finish () {
    this._output.write(1)
    this._output.close()
  }
  _shift () {
    let bit = this._low >>> (this._num_state_bits - 1)
    // console.log(`bit = ${bit}`);
    this._output.write(bit)

    // Write out the saved underflow bits
    for (let i = 0; i < this._num_underflow; i++) {
      // console.log(`bit ^ 1 = ${bit ^ 1}`);
      this._output.write(bit ^ 1)
    }
    this._num_underflow = 0
  }
  _underflow () {
    this._num_underflow += 1
  }
}

class ArithmeticDecoder extends Coder {
  /**
   *
   * @param {number} numbits
   * @param {BitInputStream} bitin
   */
  constructor (numbits, bitin) {
    super(numbits)

    // The underlying bit input stream.
    this._input = bitin
    // The current raw code bits being buffered, which is always in the range [low, high].
    this._code = 0
    for (let i = 0; i < this._num_state_bits; i++) {
      this._code = (this._code << 1) | this.readCodeBit()
      // console.log(`this._code_init = ${this._code}`);
    }
    // console.log(`this._code = ${this._code}`);
  }

  /**
   * Decodes the next symbol based on the given frequency table and returns it.
   * Also updates this arithmetic coder's state and may read in some bits.
   * @param {FrequencyTable} freqs
   */
  read (freqs) {
    // Translate from coding range scale to frequency table scale
    let total = freqs.total
    if (this._maximum_total >>> 0 < total >>> 0) {
      throw new RangeError('Cannot decode symbol because total is too large')
    }
    let range = ((this._high - this._low) + 1) >>> 0
    let offset = this._code - this._low
    let value = Math.floor((((offset + 1) * total) - 1) / range)
    // console.log(`this._code_cal = ${this._code}, offset = ${offset}, value = ${value}`);
    // console.log(`range = ${range.toString(16)}`);
    // console.log(`offset = ${offset.toString(16)}`);
    // console.log(`value = ${value.toString(16)}`);
    // console.log(`total = ${total.toString(16)}, ${typeof total}`);

    // A kind of binary search.
    // Find highest symbol such that freqs.get_low(symbol) <= value.
    let start = 0
    let end = freqs.symbolLimit
    // console.log(`start = ${start}, end = ${end}, value = ${value.toNumber()}`);
    while (end - start > 1) {
      let middle = (start + end) >>> 1
      // console.log(`freqs.getLow(middle) = ${freqs.getLow(middle)}`);
      if (value >>> 0 < freqs.getLow(middle)) {
        end = middle
      } else {
        start = middle
      }
      // console.log(`start = ${start}, end = ${end}`);
    }


    let symbol = start
    this.update(freqs, symbol)
    if (!(this._low >>> 0 <= this._code >>> 0 && this._code >>> 0 <= this._high >>> 0)) {
      throw new RangeError('Code out of range')
    }
    // console.log('symbol', symbol);
    return symbol
  }

  // Returns the next bit (0 or 1) from the input stream. The end
  // of stream is treated as an infinite number of trailing zeros.
  readCodeBit () {
    let temp = this._input.read()
    // console.log(`readCodeBit: ${temp}`);
    if (temp === -1) {
      temp = 0
    }
    return temp
  }

  _shift () {
    this._code = (this._code << 1) & (this._state_mask) | (this.readCodeBit())
    // console.log(`this._code_shift = ${this._code}`);
  }
  _underflow () {
    this._code = this._code & (this._half_range) | (
      this._code << 1 & (this._state_mask >>> 1)
    ) | (this.readCodeBit())
    // console.log(`this._code_underflow = ${this._code}`);
  }
  finish () {
    this._input.close()
  }
}

let currentIndex = 0;

let testreader = {
	read: function(){
		if(currentIndex < testbuffer.length){
			console.log(testbuffer[currentIndex])
			return testbuffer[currentIndex++];
		}
		else{
			return -1
		}
	},
	close: function(){}
}

//let dec = new ArithmeticDecoder(NUM_OF_BITS, testreader)

/*class Arithmetic_coder{
	constructor(){
		this.upper = [1];
		this.lower = [0];
		this.coded = [];
	}
	writeSymbol(symbol,model,depth){
	}
	code(){
		return this.coded.slice(1)
	}
}*/


function rePlex(integer,base){
	if(!base){
		base = BYTE_LENGTH
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

function rgba_to_yiq26a(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = R - B;
		let Cg = G - ((R + B)>>1);

		outBuffer[i] = Y;
		outBuffer[i + 1] = Co + BYTE_POWER;
		outBuffer[i + 2] = Cg + BYTE_POWER;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function rgba_to_ycocga(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = Math.floor(R/2 - B/2) + 128;
		let Cg = Math.floor(G/2 - R/4 - B/4) + 128;

		outBuffer[i] = Y;
		outBuffer[i + 1] = Co;
		outBuffer[i + 2] = Cg;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}
function rgba_to_ycocg(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = Math.floor(R/2 - B/2) + 128;
		let Cg = Math.floor(G/2 - R/4 - B/4) + 128;

		outBuffer.push(Y,Co,Cg)
	}
	return outBuffer
}

function rgb_to_ycocg(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = Math.floor(R/2 - B/2) + 128;
		let Cg = Math.floor(G/2 - R/4 - B/4) + 128;

		outBuffer.push(Y,Co,Cg)
	}
	return outBuffer
}

function ycocg_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let Y = imageData[i];
		let Co = imageData[i + 1];
		let Cg = imageData[i + 2];
		let R = Y + Co - Cg;
		let G = Y + Cg - 128;
		let B = Y - Co - Cg + 256;

		outBuffer[i] = Math.max(0,Math.min(R,255));
		outBuffer[i + 1] = Math.max(0,Math.min(G,255));
		outBuffer[i + 2] = Math.max(0,Math.min(B,255));
		outBuffer[i + 2] = B
	}
	return outBuffer
}

function ycocga_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let Y = imageData[i];
		let Co = imageData[i + 1];
		let Cg = imageData[i + 2];
		let R = Y + Co - Cg;
		let G = Y + Cg - 128;
		let B = Y - Co - Cg + 256;

		outBuffer[i] = Math.max(0,Math.min(R,255));
		outBuffer[i + 1] = Math.max(0,Math.min(G,255));
		outBuffer[i + 2] = Math.max(0,Math.min(B,255));
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function bit_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i++){
		if(imageData[i]){
			outBuffer.push(255,255,255,255)
		}
		else{
			outBuffer.push(0,0,0,255)
		}
	}
	return outBuffer
}


function rgba_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		outBuffer.push(imageData[i],imageData[i+1],imageData[i+2])
	}
	return outBuffer
}

function rgb_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		outBuffer.push(imageData[i],imageData[i+1],imageData[i+2],255)
	}
	return outBuffer
}

function check_rgba_alpha(imageData){
	for(let i=3;i<imageData.length;i += 4){
		if(imageData[i] !== 255){
			return false
		}
	}
	return true
}

function rgb_to_greyscale(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		outBuffer.push(Math.round((imageData[i] + imageData[i + 1] + imageData[i + 2])/3))
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

function check_tripplets(imageData){
	for(let i=0;i<imageData.length;i += 3){
		if(
			imageData[i] !== imageData[i + 1]
			|| imageData[i] !== imageData[i + 2]
		){
			return false
		}
	}
	return true
}

function check_index(imageData){
	let list = [];
	const index_limit = Math.min(256,imageData.length/6);
	let r_sum = 0;
	let g_sum = 0;
	let b_sum = 0;
	for(let i=0;i<imageData.length;i += 3){
		r_sum += imageData[i + 0];
		g_sum += imageData[i + 1];
		b_sum += imageData[i + 2];
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
	/*r_sum = r_sum/(imageData.length/3);
	g_sum = g_sum/(imageData.length/3);
	b_sum = b_sum/(imageData.length/3);
	let v_r = 0;
	let v_g = 0;
	let v_b = 0;
	for(let i=0;i<imageData.length;i += 3){
		v_r += Math.pow(imageData[i + 0] - r_sum,2);
		v_g += Math.pow(imageData[i + 1] - g_sum,2);
		v_b += Math.pow(imageData[i + 2] - b_sum,2);
	}
	console.log(r_sum,g_sum,b_sum);
	console.log(v_r/(imageData.length/3),v_g/(imageData.length/3),v_b/(imageData.length/3));*/

	//return list.sort((a,b) => a[0] * v_r * 0.299 + a[1] * v_g* 0.587 + a[2] * v_b * 0.299 - b[0] * v_r * 0.299 - b[1] * v_g * 0.587 - b[2] * v_b * 0.299);
	//return list.sort((a,b) => a[0] * r_sum * 0.299 + a[1] * g_sum * 0.587 + a[2] * b_sum * 0.114 - b[0] * r_sum * 0.299 - b[1]* g_sum * 0.587 - b[2] * b_sum * 0.114);
	return list
}

function check_indexa(imageData,full){
	let list = [];
	const index_limit = Math.min(256,imageData.length/8)
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
	return list.sort((a,b) => a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114 + a[3] - b[0]* 0.299 - b[1]* 0.587 - b[2] * 0.114 - b[3])
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

function rgba_to_indexeda(imageData,index,full){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		outBuffer.push(index.findIndex(
			ele => (ele[0] === imageData[i + 0]
				&& ele[1] === imageData[i + 1]
				&& ele[2] === imageData[i + 2]
				&& ele[3] === imageData[i + 3]) || (full && ele[3] === 0 && imageData[i + 3] === 0)
		))
	}
	return outBuffer
}

function greyscale_to_bitmap(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i++){
		outBuffer.push((imageData[i] < 128 ? 0 : 1))
	}
	return outBuffer
}

function check_bitmap(imageData){
	for(let i=0;i<imageData.length;i++){
		if(
			imageData[i] !== 0
			&& imageData[i] !== 255
		){
			return false
		}
	}
	return true
}

function rgb_to_yiq26(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let R = imageData[i];
		let G = imageData[i + 1];
		let B = imageData[i + 2];
		let Y = (((R + B)>>1) + G)>>1;
		let Co = R - B;
		let Cg = G - ((R + B)>>1);

		outBuffer[i] = Y;
		outBuffer[i + 1] = Co + BYTE_POWER;
		outBuffer[i + 2] = Cg + BYTE_POWER
	}
	return outBuffer
}

function yiq26a_to_rgba(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 4){
		let Y = imageData[i];
		let Co = imageData[i + 1] - BYTE_POWER;
		let Cg = imageData[i + 2] - BYTE_POWER;
		let G = Y - ((-Cg)>>1);
		let B = Y + ((1-Cg)>>1) - (Co>>1);
		let R = Co + B;

		outBuffer[i] = R;
		outBuffer[i + 1] = G;
		outBuffer[i + 2] = B;
		outBuffer[i + 3] = imageData[i + 3]
	}
	return outBuffer
}

function yiq26_to_rgb(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		let Y = imageData[i];
		let Co = imageData[i + 1] - BYTE_POWER;
		let Cg = imageData[i + 2] - BYTE_POWER;
		let G = Y - ((-Cg)>>1);
		let B = Y + ((1-Cg)>>1) - (Co>>1);
		let R = Co + B;

		outBuffer[i] = R;
		outBuffer[i + 1] = G;
		outBuffer[i + 2] = B
	}
	return outBuffer
}

function add8bitAlpha(imageData){
	let outBuffer = [];
	for(let i=0;i<imageData.length;i += 3){
		outBuffer.push(imageData[i]);
		outBuffer.push(imageData[i + 1]);
		outBuffer.push(imageData[i + 2]);
		outBuffer.push(255);
	}
	return outBuffer
}

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
	for(let i=0;i<width;i++){
		for(let j=0;j<height;j++){
			for(let k=0;k<channelNumber;k++){
				channelArray[k][i][j] = imageData[(j * width + i)*channelNumber + k]
			}
		}
	}
	return channelArray
}

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
		workList.push({
			isInternal: false,
			symbol: Object.keys(freqs)[0],
			frequency: 0
		})
	}
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

function buildBook(huffmanTree){
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
	traverse(huffmanTree,[]).forEach(entry => {
		book[entry.symbol] = entry.code
	})
	return book
}

function primitive_huffman(states){
	let base_freq = [];
	let start = 10000;
	for(let i=0;i<states;i++){
		base_freq.push(start);
		start = Math.round(start * (1/2 + (0.9 - 1/Math.sqrt(states))/2));
	}
	return createHuffman(base_freq)
}

function primitive_bi_huffman(states){
	let base_freq = [];
	let start = 128;
	for(let i=0;i<Math.floor(states/2);i++){
		base_freq.push(start - 4);
		start = Math.ceil(start * 9/10);
	}
	if(states % 2){
		return [124].concat(base_freq).concat(base_freq.reverse())
	}
	
	return [124].concat(base_freq).concat(base_freq.slice(0,base_freq.length - 1).reverse())
}

function find_average(chunck,ceiling){
	let sum = 0;
	for(let i=0;i < chunck.length;i++){
		for(let j=0;j < chunck[i].length;j++){
			if(Math.abs(chunck[i][j] - ceiling) < Math.abs(chunck[i][j])){
				sum += chunck[i][j] - ceiling
			}
			else if(Math.abs(chunck[i][j] + ceiling) < Math.abs(chunck[i][j])){
				sum += chunck[i][j] + ceiling
			}
			else{
				sum += chunck[i][j]
			}
		}
	}
	return Math.round(sum/(chunck.length * chunck[0].length))
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

function create_vertical_dummy(colour1,colour2,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(j < size/2){
				col.push(colour1)
			}
			else{
				col.push(colour2)
			}
		}
		data.push(col)
	}
	return data
}

function create_horizontal_dummy(colour1,colour2,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(i < size/2){
				col.push(colour1)
			}
			else{
				col.push(colour2)
			}
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

function create_diagonal_half_solid(colour1,colour2,direction,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction === 0){
				if(i + j < size){
					col.push(colour1)
				}
				else{
					col.push(Math.round(
						colour1 + (colour2 - colour1) * (i + j - size + 1)/(size - 1)
					))
				}
			}
			else if(direction === 1){
				if((size - i - 1) + j < size){
					col.push(colour1)
				}
				else{
					col.push(Math.round(
						colour1 + (colour2 - colour1) * ((size - i - 1) + j - size + 1)/(size - 1)
					))
				}
			}
			else if(direction === 2){
				if((size - i - 1) + (size - j - 1) < size){
					col.push(colour1)
				}
				else{
					col.push(Math.round(
						colour1 + (colour2 - colour1) * ((size - i - 1) + (size - j - 1) - size + 1)/(size - 1)
					))
				}
			}
			else if(direction === 3){
				if(i + (size - j - 1) < size){
					col.push(colour1)
				}
				else{
					col.push(Math.round(
						colour1 + (colour2 - colour1) * (i + (size - j - 1) - size + 1)/(size - 1)
					))
				}
			}
		}
		data.push(col)
	}
	return data
}


function create_odd_solid(colour1,colour2,direction,steep,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				if(steep){
					if((size - i - 1) < size/4){
						col.push(colour1)
					}
					else if((size - i - 1) >= 3*size/4){
						col.push(colour2)
					}
					else if(((size - i - 1) - size/4)*2 + j === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if(((size - i - 1) - size/4)*2 + j < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(j < size/4){
						col.push(colour1)
					}
					else if(j >= 3*size/4){
						col.push(colour2)
					}
					else if((j - size/4)*2 + (size - i - 1) === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if((j - size/4)*2 + (size - i - 1) < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
			else{
				if(steep){
					if(i < size/4){
						col.push(colour1)
					}
					else if(i >= 3*size/4){
						col.push(colour2)
					}
					else if((i - size/4)*2 + j === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if((i - size/4)*2 + j < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(j < size/4){
						col.push(colour1)
					}
					else if(j >= 3*size/4){
						col.push(colour2)
					}
					else if((j - size/4)*2 + i === size - 1){
						col.push(Math.round((colour1 + colour2)/2))
					}
					else if((j - size/4)*2 + i < size){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
		}
		data.push(col)
	}
	return data
}

function create_dip(colour1,colour2,direction,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				col.push(Math.round(colour2 + (colour1 - colour2) * Math.abs(i - j)/(size - 1)))
			}
			else{
				col.push(Math.round(colour2 + (colour1 - colour2) * Math.abs((size - i - 1) - j)/(size - 1)))
			}
		}
		data.push(col)
	}
	return data
}

function create_third(colour1,colour2,direction,fullness,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			if(direction){
				if(fullness){
					if(j < Math.round(2*size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(j < Math.round(size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
			else{
				if(fullness){
					if(i < Math.round(2*size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
				else{
					if(i < Math.round(size/3)){
						col.push(colour1)
					}
					else{
						col.push(colour2)
					}
				}
			}
		}
		data.push(col)
	}
	return data
}

function create_dct(colour1,colour2,h_freq,v_freq,size){
	let data = []
	for(let i=0;i<size;i++){
		let col = [];
		for(let j=0;j<size;j++){
			let abo = Math.abs(Math.cos(i*h_freq*Math.PI/(size-1)) + Math.cos(j*v_freq*Math.PI/(size-1)))/2;
			col.push(Math.round(colour1 * abo + colour2 * (1-abo)))
		}
		data.push(col)
	}
	return data
}

function sample(chunck,arr){
	let size = chunck.length;
	let dct = arr;
	let sum_a = 0;
	let count_a = 0;
	let sum_b = 0;
	let count_b = 0;
	for(let i=0;i<size;i++){
		for(let j=0;j<size;j++){
			if(dct[i][j] < 0.2){
				sum_a += chunck[i][j];
				count_a++
			}
			else if(dct[i][j] > 0.8){
				sum_b += chunck[i][j];
				count_b++
			}
		}
	}
	return [Math.round(sum_a/count_a),Math.round(sum_b/count_b)]
}

function sample_dct(chunck,h_freq,v_freq){
	let size = chunck.length;
	let dct = create_dct(0,1,h_freq,v_freq,size);
	return sample(chunck,dct);
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
	//"PREVIOUS",
	//"PREVIOUS2"
]

const largeSymbolTable = [
	"divide",
	"whole",
	"vertical",
	"horizontal",
	"diagonal_NW",
	"diagonal_NE",
	"diagonal_solid_NW",
	"diagonal_solid_NE",
	"steep_NW",
	"steep_NE",
	"calm_NW",
	"calm_NE",
	"dip_NW",
	"dip_NE",
	"horizontal_third",
	"horizontal_large_third",
	"vertical_third",
	"vertical_large_third",
	"dct01",
	"dct10",
	"dct03",
	"dct30",
	"dct11",
	"dct22",
	"dct33",
	"dct12",
	"dct13",
	"dct21",
	"dct31",
	"dct02",
	"dct20",
	"dct32",
	"dct23",
	"PREVIOUS",
	"PREVIOUS2",
	"PREVIOUS3",
	"PREVIOUS4",
	"PREVIOUS5",
	"PREVIOUS6",
	"PREVIOUS7",
	"PREVIOUS8",
	"PREVIOUS9",
	"PREVIOUS10",
	"diagonal_half_NW",
	"diagonal_half_NE",
	"diagonal_half_SE",
	"diagonal_half_SW"
]

const internal_formats = [
	"bit","greyscale","greyscalea","rgb","rgba","yiq26","yiq26a","ycocg","ycocga","indexed","indexeda","verbatim","verbatima","verbatimgreyscale","verbatimbit"
]

function encoder(imageData,options){
	let t0 = performance.now()
	console.info("ENCODING");
	const width = options.width;
	const height = options.height;
	const encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));
	if(!internal_formats.includes(options.pixelFormat)){
		throw "only " + internal_formats.join(", ") + " supported"
	}
	if(options.target_pixelFormat && !internal_formats.includes(options.target_pixelFormat)){
		throw "only " + internal_formats.join(", ") + " supported"
	}

	if(!options.target_pixelFormat){
		if(options.pixelFormat === "rgb"){
			if(options.colourQuantizer === 0){
				options.target_pixelFormat = "yiq26"
			}
			else{
				options.target_pixelFormat = "ycocg"
			}
		}
		else if(options.pixelFormat === "rgba"){
			if(options.colourQuantizer === 0){
				options.target_pixelFormat = "yiq26a"
			}
			else{
				options.target_pixelFormat = "ycocga"
			}
		}
		else{
			options.target_pixelFormat = options.pixelFormat
		}
	}
	let c_index;
	if(options.optimizeChannels){
		if(options.pixelFormat === "rgba"){
			if(check_rgba_alpha(imageData)){
				console.log("removing redundant alpha");
				imageData = rgba_to_rgb(imageData);
				options.pixelFormat = "rgb";
				if(options.target_pixelFormat === "yiq26a"){
					options.target_pixelFormat = "yiq26"
				}
				else if(options.target_pixelFormat === "ycocga"){
					options.target_pixelFormat = "ycocg"
				}
			}
			else{
				c_index = check_indexa(imageData,options.fullTransparancyOptimization);
				if(c_index){
					imageData = rgba_to_indexeda(imageData,c_index,options.fullTransparancyOptimization);
					options.target_pixelFormat = "indexeda"
					console.log("c_index",c_index);
				}
			}
		}
		if(options.pixelFormat === "rgb"){
			if(check_tripplets(imageData)){
				console.log("removing redundant chroma channels");
				imageData = rgb_to_greyscale(imageData);
				options.pixelFormat = "greyscale";
				options.target_pixelFormat = "greyscale"
			}
			else{
				c_index = check_index(imageData);
				if(c_index){
					options.target_pixelFormat = "indexed"
				}
			}
		}
		if(options.pixelFormat === "greyscale"){
			if(check_bitmap(imageData)){
				console.log("encoding as bitmap");
				imageData = greyscale_to_bitmap(imageData);
				options.pixelFormat = "bit";
				options.target_pixelFormat = "bit";
			}
		}
	}

	let encodedData = [];
	let bitBuffer = [];

	let writeByteNative = function(integer){
		bitBuffer = bitBuffer.concat(rePlex(integer));
		encodedData.push(dePlex(bitBuffer.splice(0,BYTE_LENGTH)));
	}
	let writeBitNative = function(integer){
		bitBuffer.push(integer);
		if(bitBuffer.length > (BYTE_LENGTH - 1)){
			encodedData.push(dePlex(bitBuffer.splice(0,BYTE_LENGTH)))
		}
	}
	let flushBitBuffer = function(){
		while(bitBuffer.length > (BYTE_LENGTH - 1)){
			encodedData.push(dePlex(bitBuffer.splice(0,BYTE_LENGTH)))
		}
	}

//write header
	writeByteNative(72);writeByteNative(79);writeByteNative(72);
	bitBuffer.push(...encodeVarint(width,BYTE_LENGTH));
	bitBuffer.push(...encodeVarint(height,BYTE_LENGTH));
	writeByteNative(internal_formats.indexOf(options.target_pixelFormat));
	bitBuffer.push(...encodeVarint(0,BYTE_LENGTH));//still image
//end write header

	console.log("target",options.target_pixelFormat);
	if(options.pixelFormat === "rgba"){
		if(options.target_pixelFormat === "yiq26a"){
			imageData = rgba_to_yiq26a(imageData)
		}
		else if(options.target_pixelFormat === "ycocga"){
			imageData = rgba_to_ycocga(imageData)
		}
	}
	if(options.pixelFormat === "rgb"){
		if(options.target_pixelFormat === "yiq26"){
			imageData = rgb_to_yiq26(imageData)
		}
		else if(options.target_pixelFormat === "yiq26a"){
			imageData = add8bitAlpha(rgb_to_yiq26(imageData))
		}
		else if(options.target_pixelFormat === "ycocg"){
			imageData = rgb_to_ycocg(imageData)
		}
	}

	if(!options.maxBlockSize){
		options.maxBlockSize = encoding_size
	}

	let channels = deMultiplexChannels(imageData,width,height);

	let hasAlphaMap = false;
	let alphaMap;

	encodeChannel = function(channelData,c_options){
		const CHANNEL_LENGTH = c_options.bitDepth;
		const CHANNEL_POWER = Math.pow(2,CHANNEL_LENGTH);
		const CHANNEL_MAX_VAL = CHANNEL_POWER - 1;
		
		let bitBuffer = [];

		if(!c_options.quantizer){
			c_options.quantizer = options.quantizer
		}

		if(c_options.indexed){
			bitBuffer.push(...rePlex(c_options.c_index.length - 1,8));
			c_options.c_index.forEach(colour => {
				bitBuffer.push(...rePlex(colour[0],8));
				bitBuffer.push(...rePlex(colour[1],8));
				bitBuffer.push(...rePlex(colour[2],8));
			})
		}
		else if(c_options.indexeda){
			bitBuffer.push(...rePlex(c_options.c_index.length - 1,8));
			c_options.c_index.forEach(colour => {
				bitBuffer.push(...rePlex(colour[0],8));
				bitBuffer.push(...rePlex(colour[1],8));
				bitBuffer.push(...rePlex(colour[2],8));
				bitBuffer.push(...rePlex(colour[3],8));
			})
		}

		let aritmetic_queue = [];

		let table_ceiling = CHANNEL_POWER;
		let occupied;
		let frequencyTable;
		let delta_data;
		let range_data;
		if(CHANNEL_LENGTH > 1){
//tables
			frequencyTable = new Array(CHANNEL_POWER).fill(0);
			for(let i=0;i<channelData.length;i++){
				for(let j=0;j<channelData[0].length;j++){
					frequencyTable[channelData[i][j]]++;
				}
			};
			occupied = frequencyTable.filter(a => a).length;
			console.log(c_options.name,Math.round(100*occupied/frequencyTable.length) + "%",frequencyTable);
			delta_data = rePlex(occupied,CHANNEL_LENGTH);
			let delta = 0;

			const PRIMITIVE = buildBook(primitive_huffman(CHANNEL_POWER));

			for(let i=0;i<CHANNEL_POWER;i++){
				delta++;
				if(frequencyTable[i]){
					delta_data = delta_data.concat(PRIMITIVE[delta - 1]);
					delta = 0
				}
			}
			console.log(c_options.name,"delta table size",delta_data.length);
		
			range_data = [];
			let rangeActive = false;
			delta = 0;
			let shift_counter = 0;
			for(let i=0;i<CHANNEL_POWER;i++){
				delta++;
				if(
					(frequencyTable[i] && rangeActive === false)
					|| (!frequencyTable[i] && rangeActive === true)
				){
					rangeActive = !rangeActive;
					shift_counter++;
					range_data = range_data.concat(PRIMITIVE[delta - 1]);
					delta = 0;

				}
				if(
					i === CHANNEL_MAX_VAL
					&& rangeActive
				){
					range_data = range_data.concat(PRIMITIVE[delta]);
					shift_counter++
				}
			}
			range_data = rePlex(shift_counter/2,CHANNEL_LENGTH - 1).concat(range_data);
			console.log(c_options.name,"range delta table size",range_data.length);

			let translationTable = new Array(CHANNEL_POWER);
			delta = 0;
			for(let i=0;i<CHANNEL_POWER;i++){
				if(
					frequencyTable[i]
				){
					translationTable[i] = delta;
					delta++
				}
			}
			table_ceiling = delta;
			console.log("table ceiling",table_ceiling);

			for(let i=0;i<channelData.length;i++){
				for(let j=0;j<channelData[0].length;j++){
					let temp = channelData[i][j];
					channelData[i][j] = translationTable[channelData[i][j]]
				}
			}
		}
//end tables

		let min_black = frequencyTable ? frequencyTable.findIndex(a => a) : 0;

		let grower = function(num){
			return Math.max(num - num*num/512,1)
		}

		if(c_options.name === "Co" || c_options.name === "Cg"){
			grower = function(num){
				return 128
			}
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
							) + min_black),
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
		if(c_options.quantizer === 0){
			if(hasAlphaMap){
				error_compare = function(chunck1,chunck2,offx,offy){
					for(let i=0;i<chunck1.length;i++){
						for(let j=0;j<chunck1[i].length;j++){
							if(offx + i < width && offy + j < height){
								if(
									Math.abs(
										chunck2[i][j] - chunck1[i][j]
									) && (!alphaMap[i + offx][j + offy])
								){
									return 1
								}
							}
						}
					}
					return 0
				}
			}
			else{
				error_compare = function(chunck1,chunck2,offx,offy){
					for(let i=0;i<chunck1.length;i++){
						for(let j=0;j<chunck1[i].length;j++){
							if(offx + i < width && offy + j < height){
								if(
									Math.abs(
										chunck2[i][j] - chunck1[i][j]
									)
								){
									return 1
								}
							}
						}
					}
					return 0
				}
			}
		}
			
		let currentEncode = [];
		for(let i=0;i<channelData.length;i++){
			currentEncode.push(new Array(height).fill(0))
		}

		function get_chunck_encode(x,y,size){
			let data = [];
			for(let i=x;i<x + size;i++){
				let col = [];
				if(i >= width){
					for(let j=y;j<y + size;j++){
						col.push(currentEncode[width - 1][j] || currentEncode[width - 1][height - 1])
					}
				}
				else{
					for(let j=y;j<y + size;j++){
						if(j >= height){
							col.push(currentEncode[i][height - 1])
						}
						else{
							col.push(currentEncode[i][j])
						}
					}
				}
				data.push(col)
			}
			return data
		}

		function write_chunck(curr,chunck){
			for(let i=0;i < curr.size && (i + curr.x) < width;i++){
				for(let j=0;j < curr.size && (j + curr.y) < height;j++){
					currentEncode[i + curr.x][j + curr.y] = chunck[i][j]
				}
			}
		}

		function get_chunck(x,y,size){
			let data = [];
			for(let i=x;i<x + size;i++){
				let col = [];
				if(i >= width){
					for(let j=y;j<y + size;j++){
						col.push(channelData[width - 1][j] || channelData[width - 1][height - 1])
					}
				}
				else{
					for(let j=y;j<y + size;j++){
						if(j >= height){
							col.push(channelData[i][height - 1])
						}
						else{
							col.push(channelData[i][j])
						}
					}
				}
				data.push(col)
			}
			/*if(data.flat().filter(a => a === undefined).length){
				console.log("data",data);
				for(let i=0;i<data.length;i++){
					for(let j=0;j<data.length;j++){
						if(data[i][j] === undefined){
							console.log(i,j,channelData[i][j])
							throw "data"
						}
					}
				}
				throw "data"
			}*/
			return data
		}

		let smallSymbolFrequency = {};
		smallSymbolTable.forEach(word => smallSymbolFrequency[word] = 0);


		let largeSymbolFrequency = {};
		largeSymbolTable.forEach(word => largeSymbolFrequency[word] = 0);

		let writeSymbol = function(symbol){
			aritmetic_queue.push({size: "small",symbol: symbol});
			smallSymbolFrequency[symbol]++
		}
		if(table_ceiling === 2){
			writeSymbol = function(symbol){
				aritmetic_queue.push({size: "small",symbol: symbol});
			}
		}
		let writeLargeSymbol = function(symbol,is4x4){
			if(is4x4){
				aritmetic_queue.push({size: "large",symbol: symbol,is4x4: true});
			}
			else{
				aritmetic_queue.push({size: "large",symbol: symbol,is4x4: false});
			}
			largeSymbolFrequency[symbol]++
		}
		let writeByte = function(integer){
			aritmetic_queue.push(integer)
		}
		let sharpener = function(a,b,resolver,errorFunction,symbol){
			let patch = resolver(a,b);
			let error = errorFunction(patch);
			if(options.forceGradients && c_options.quantizer){
				let new_a = Math.min(a + 1,table_ceiling - 1);
				let diff = 1;
				if(a < b){
					new_a = Math.max(a - 1,0);
					diff = -1
				}
				let new_patch = resolver(new_a,b);
				let new_error = errorFunction(new_patch);
				while(new_error < error){
					a = new_a;
					patch = new_patch;
					error = new_error;
					new_a = Math.min(table_ceiling - 1,Math.max(a + diff,0));
					new_error = errorFunction(resolver(new_a,b))
				}
				let new_b = Math.min(table_ceiling - 1,Math.max(b - diff,0));
				new_patch = resolver(a,new_b);
				new_error = errorFunction(new_patch);
				while(new_error < error){
					b = new_b;
					patch = new_patch;
					error = new_error;
					new_b = Math.min(table_ceiling - 1,Math.max(b - diff,0));
					new_error = errorFunction(resolver(a,new_b))
				}
			}
			return {
				symbol: symbol,
				error: error,
				patch: patch,
				colours: [a,b]
			}
		}
		let asample_dct = sample_dct;
		if(table_ceiling === 2){
			if(options.forceGradients){
				sharpener = function(a,b,resolver,errorFunction,symbol){
					let patch = resolver(0,1);
					let patch2 = resolver(1,0);
					let error = errorFunction(patch);
					let error2 = errorFunction(patch2);
					if(error < error2){
						return {
							symbol: symbol,
							error: error,
							patch: patch,
							colours: [0,1]
						}
					}
					else{
						return {
							symbol: symbol,
							error: error2,
							patch: patch2,
							colours: [1,0]
						}
					}
				}
				asample_dct = function(){
					return [0,1]
				}
			}
			else{
				sharpener = function(a,b,resolver,errorFunction,symbol){
					if(a === b){
						b === +!a
					}
					let patch = resolver(a,b);
					let error = errorFunction(patch);
					return {
						symbol: symbol,
						error: error,
						patch: patch,
						colours: [a,b]
					}
				}
			}
			/*error_compare = function(chunck1,chunck2,offx,offy){
				let sumError = 0;
				for(let i=0;i<chunck1.length;i++){
					for(let j=0;j<chunck1[i].length;j++){
						if(offx + i < width && offy + j < height){
							sumError += Math.abs(chunck2[i][j] - chunck1[i][j])
						}
					}
				}
				return sumError/(chunck1.length * chunck1[0].length)
			}*/
		}

		let previous2x2_curr = [];
		let previous4x4_curr = [];
		let previous8x8_curr = [];
		let previous16x16_curr = [];
		let previous32x32_curr = [];

		let blockQueue = [{x: 0,y:0, size: encoding_size}];

		while(blockQueue.length){
			let curr = blockQueue.pop();
			if(
				curr.x >= width
				|| curr.y >= height
			){
				continue
			}
			if(curr.size >= 4){
				previous4x4_curr.push({
					x: curr.x,
					y: curr.y + curr.size - 4,
					size: 4
				})
				if(previous4x4_curr.length > 15){
					previous4x4_curr.shift()
				}
			}
			if(curr.size >= 8){
				previous8x8_curr.push({
					x: curr.x,
					y: curr.y + curr.size - 8,
					size: 8
				})
				if(previous8x8_curr.length > 15){
					previous8x8_curr.shift()
				}
			}
			if(curr.size >= 16){
				previous16x16_curr.push({
					x: curr.x,
					y: curr.y + curr.size - 16,
					size: 16
				})
				if(previous16x16_curr.length > 15){
					previous16x16_curr.shift()
				}
			}
			if(curr.size >= 32){
				previous32x32_curr.push({
					x: curr.x,
					y: curr.y + curr.size - 32,
					size: 32
				})
				if(previous32x32_curr.length > 15){
					previous32x32_curr.shift()
				}
			}
			if(
				(
					options.maxBlockSize && curr.size > options.maxBlockSize
				)
				|| (
					options.quantizer === 0
					&& curr.size > 2
					&& (curr.x + 1) < width
					&& (curr.y + 1) < height
					&& channelData[curr.x][curr.y] !== channelData[curr.x + 1][curr.y]
					&& channelData[curr.x][curr.y] !== channelData[curr.x][curr.y + 1]
					&& channelData[curr.x][curr.y + 1] !== channelData[curr.x + 1][curr.y]
					&& channelData[curr.x][curr.y] !== channelData[curr.x + 1][curr.y + 1]
				)
			){
				writeLargeSymbol("divide",curr.size === 4);
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
				let errorQueue = [];
				let localQuantizer = 100*c_options.quantizer/(curr.size);
				//let localQuantizer = options.quantizer;

				let average = find_average(chunck);
				let avg_error = error_compare(chunck,create_uniform(average,curr.size),curr.x,curr.y);
				
				errorQueue.push({
					symbol: "whole",
					error: avg_error,
					patch: create_uniform(average,curr.size),
					colours: [average]
				})
				let mArr;
				if(c_options.quantizer === 0){//only the corner pixels matter in lossless mode, so about 25% of the encoding time can be saved here
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
				if(curr.size === 4){
					if(previous4x4_curr.length >= 2){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 2].x,previous4x4_curr[previous4x4_curr.length - 2].y,4);
						errorQueue.push({
							symbol: "PREVIOUS",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 3){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 3].x,previous4x4_curr[previous4x4_curr.length - 3].y,4);
						errorQueue.push({
							symbol: "PREVIOUS2",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 4){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 4].x,previous4x4_curr[previous4x4_curr.length - 4].y,4);
						errorQueue.push({
							symbol: "PREVIOUS3",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 5){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 5].x,previous4x4_curr[previous4x4_curr.length - 5].y,4);
						errorQueue.push({
							symbol: "PREVIOUS4",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 6){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 6].x,previous4x4_curr[previous4x4_curr.length - 6].y,4);
						errorQueue.push({
							symbol: "PREVIOUS5",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 7){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 7].x,previous4x4_curr[previous4x4_curr.length - 7].y,4);
						errorQueue.push({
							symbol: "PREVIOUS6",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 8){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 8].x,previous4x4_curr[previous4x4_curr.length - 8].y,4);
						errorQueue.push({
							symbol: "PREVIOUS7",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 9){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 9].x,previous4x4_curr[previous4x4_curr.length - 9].y,4);
						errorQueue.push({
							symbol: "PREVIOUS8",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 10){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 10].x,previous4x4_curr[previous4x4_curr.length - 10].y,4);
						errorQueue.push({
							symbol: "PREVIOUS9",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous4x4_curr.length >= 11){
						let patch = get_chunck_encode(previous4x4_curr[previous4x4_curr.length - 11].x,previous4x4_curr[previous4x4_curr.length - 11].y,4);
						errorQueue.push({
							symbol: "PREVIOUS10",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
				}
				else if(curr.size === 8){
					if(previous8x8_curr.length >= 2){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 2].x,previous8x8_curr[previous8x8_curr.length - 2].y,8);
						errorQueue.push({
							symbol: "PREVIOUS",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 3){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 3].x,previous8x8_curr[previous8x8_curr.length - 3].y,8);
						errorQueue.push({
							symbol: "PREVIOUS2",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 4){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 4].x,previous8x8_curr[previous8x8_curr.length - 4].y,8);
						errorQueue.push({
							symbol: "PREVIOUS3",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 5){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 5].x,previous8x8_curr[previous8x8_curr.length - 5].y,8);
						errorQueue.push({
							symbol: "PREVIOUS4",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 6){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 6].x,previous8x8_curr[previous8x8_curr.length - 6].y,8);
						errorQueue.push({
							symbol: "PREVIOUS5",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 7){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 7].x,previous8x8_curr[previous8x8_curr.length - 7].y,8);
						errorQueue.push({
							symbol: "PREVIOUS6",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 8){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 8].x,previous8x8_curr[previous8x8_curr.length - 8].y,8);
						errorQueue.push({
							symbol: "PREVIOUS7",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 9){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 9].x,previous8x8_curr[previous8x8_curr.length - 9].y,8);
						errorQueue.push({
							symbol: "PREVIOUS8",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 10){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 10].x,previous8x8_curr[previous8x8_curr.length - 10].y,8);
						errorQueue.push({
							symbol: "PREVIOUS9",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous8x8_curr.length >= 11){
						let patch = get_chunck_encode(previous8x8_curr[previous8x8_curr.length - 11].x,previous8x8_curr[previous8x8_curr.length - 11].y,8);
						errorQueue.push({
							symbol: "PREVIOUS10",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
				}
				else if(curr.size === 16){
					if(previous16x16_curr.length >= 2){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 2].x,previous16x16_curr[previous16x16_curr.length - 2].y,16);
						errorQueue.push({
							symbol: "PREVIOUS",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 3){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 3].x,previous16x16_curr[previous16x16_curr.length - 3].y,16);
						errorQueue.push({
							symbol: "PREVIOUS2",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 4){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 4].x,previous16x16_curr[previous16x16_curr.length - 4].y,16);
						errorQueue.push({
							symbol: "PREVIOUS3",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 5){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 5].x,previous16x16_curr[previous16x16_curr.length - 5].y,16);
						errorQueue.push({
							symbol: "PREVIOUS4",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 6){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 6].x,previous16x16_curr[previous16x16_curr.length - 6].y,16);
						errorQueue.push({
							symbol: "PREVIOUS5",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 7){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 7].x,previous16x16_curr[previous16x16_curr.length - 7].y,16);
						errorQueue.push({
							symbol: "PREVIOUS6",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 8){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 8].x,previous16x16_curr[previous16x16_curr.length - 8].y,16);
						errorQueue.push({
							symbol: "PREVIOUS7",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 9){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 9].x,previous16x16_curr[previous16x16_curr.length - 9].y,16);
						errorQueue.push({
							symbol: "PREVIOUS8",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 10){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 10].x,previous16x16_curr[previous16x16_curr.length - 10].y,16);
						errorQueue.push({
							symbol: "PREVIOUS9",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous16x16_curr.length >= 11){
						let patch = get_chunck_encode(previous16x16_curr[previous16x16_curr.length - 11].x,previous16x16_curr[previous16x16_curr.length - 11].y,16);
						errorQueue.push({
							symbol: "PREVIOUS10",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
				}
				else if(curr.size === 32){
					if(previous32x32_curr.length >= 2){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 2].x,previous32x32_curr[previous32x32_curr.length - 2].y,32);
						errorQueue.push({
							symbol: "PREVIOUS",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 3){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 3].x,previous32x32_curr[previous32x32_curr.length - 3].y,32);
						errorQueue.push({
							symbol: "PREVIOUS2",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 4){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 4].x,previous32x32_curr[previous32x32_curr.length - 4].y,32);
						errorQueue.push({
							symbol: "PREVIOUS3",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 5){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 5].x,previous32x32_curr[previous32x32_curr.length - 5].y,32);
						errorQueue.push({
							symbol: "PREVIOUS4",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 6){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 6].x,previous32x32_curr[previous32x32_curr.length - 6].y,32);
						errorQueue.push({
							symbol: "PREVIOUS5",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 7){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 7].x,previous32x32_curr[previous32x32_curr.length - 7].y,32);
						errorQueue.push({
							symbol: "PREVIOUS6",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 8){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 8].x,previous32x32_curr[previous32x32_curr.length - 8].y,32);
						errorQueue.push({
							symbol: "PREVIOUS7",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 9){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 9].x,previous32x32_curr[previous32x32_curr.length - 9].y,32);
						errorQueue.push({
							symbol: "PREVIOUS8",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 10){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 10].x,previous32x32_curr[previous32x32_curr.length - 10].y,32);
						errorQueue.push({
							symbol: "PREVIOUS9",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
					if(previous32x32_curr.length >= 11){
						let patch = get_chunck_encode(previous32x32_curr[previous32x32_curr.length - 11].x,previous32x32_curr[previous32x32_curr.length - 11].y,32);
						errorQueue.push({
							symbol: "PREVIOUS10",
							error: error_compare(chunck,patch,curr.x,curr.y),
							patch: patch,
							colours: []
						})
					}
				}


				let top_third_large;
				let bottom_third_large;
				let left_third_large;
				let right_third_large;
				if(c_options.quantizer > 0){
					left_third_large = Math.round((
						mArr[0] + mArr[1] + mArr[4] + mArr[5] + mArr[8] + mArr[9] + mArr[12] + mArr[13]
						+ mArr[2]/2 + mArr[6]/2 + mArr[10]/2 + mArr[14]/2
					)/10);
					let right_third_small = Math.round((mArr[3] + mArr[7] + mArr[11] + mArr[15])/4);

					let left_third_small = Math.round((mArr[0] + mArr[4] + mArr[8] + mArr[12])/4);
					right_third_large = Math.round((
						mArr[3] + mArr[7] + mArr[11] + mArr[15] + mArr[2] + mArr[6] + mArr[10] + mArr[14]
						+ mArr[1]/2 + mArr[5]/2 + mArr[9]/2 + mArr[13]/2
					)/10);

					top_third_large = Math.round((
						mArr[0] + mArr[1] + mArr[2] + mArr[3] + mArr[4] + mArr[5] + mArr[6] + mArr[7]
						 + mArr[8]/2 + mArr[9]/2 + mArr[10]/2 + mArr[11]/2
					)/10);
					let bottom_third_small = Math.round((mArr[12] + mArr[13] + mArr[14] + mArr[15])/4);

					let top_third_small = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[3])/4);
					bottom_third_large = Math.round((
						mArr[8] + mArr[9] + mArr[10] + mArr[11] + mArr[12] + mArr[13] + mArr[14] + mArr[15]
						 + mArr[4]/2 + mArr[5]/2 + mArr[6]/2 + mArr[7]/2
					)/10);
					let top = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[3])/4);
					let bottom = Math.round((mArr[12] + mArr[13] + mArr[14] + mArr[15])/4);

					let left = Math.round((mArr[0] + mArr[4] + mArr[8] + mArr[12])/4);
					let right = Math.round((mArr[3] + mArr[7] + mArr[11] + mArr[15])/4);

					let NW = mArr[0];
					let SE = mArr[15];

					let NE = mArr[3];
					let SW = mArr[12];

					let NW_s = Math.round((mArr[0] + mArr[1] + mArr[2] + mArr[4] + mArr[5] + mArr[8])/6);
					let SE_s = Math.round((mArr[7] + mArr[10] + mArr[11] + mArr[13] + mArr[14] + mArr[15])/6);

					let NE_s = Math.round((mArr[1] + mArr[2] + mArr[3] + mArr[6] + mArr[7] + mArr[11])/6);
					let SW_s = Math.round((mArr[4] + mArr[8] + mArr[9] + mArr[12] + mArr[13] + mArr[14])/6);

					let steep_NW = Math.round((mArr[0] + mArr[1] + mArr[4] + mArr[5] + mArr[8] + mArr[12])/6);
					let steep_SE = Math.round((mArr[3] + mArr[7] + mArr[10] + mArr[11] + mArr[14] + mArr[15])/6);

					let calm_NW = Math.round((mArr[0] + mArr[1] + mArr[4] + mArr[5] + mArr[2] + mArr[3])/6);
					let calm_SE = Math.round((mArr[12] + mArr[13] + mArr[10] + mArr[11] + mArr[14] + mArr[15])/6);

					let steep_NE = Math.round((mArr[3] + mArr[2] + mArr[7] + mArr[6] + mArr[11] + mArr[15])/6);
					let steep_SW = Math.round((mArr[0] + mArr[4] + mArr[8] + mArr[9] + mArr[12] + mArr[13])/6);

					let calm_NE = Math.round((mArr[0] + mArr[1] + mArr[6] + mArr[7] + mArr[2] + mArr[3])/6);
					let calm_SW = Math.round((mArr[12] + mArr[13] + mArr[8] + mArr[9] + mArr[14] + mArr[15])/6);
					let corner_NW_SE = Math.round((mArr[0]*2 + mArr[1] + mArr[4] + mArr[11] + mArr[14] + mArr[15]*2)/8);
					let skraa_NE_SW = Math.round((mArr[3] + mArr[6] + mArr[9] + mArr[12])/4);

					let corner_NE_SW = Math.round((mArr[2] + mArr[3]*2 + mArr[7] + mArr[8] + mArr[12]*2 + mArr[13])/8);
					let skraa_NW_SE = Math.round((mArr[0] + mArr[5] + mArr[10] + mArr[15])/4);


					let middle_vertical = Math.round((mArr[1] + mArr[2] + mArr[5] + mArr[6] + mArr[9] + mArr[10] + mArr[13] + mArr[14])/8);
					let middle_horizontal = Math.round((mArr[4] + mArr[8] + mArr[5] + mArr[6] + mArr[9] + mArr[10] + mArr[7] + mArr[11])/8);

					errorQueue.push(sharpener(
						top,
						bottom,
						(a,b) => create_vertical_gradient(a,b,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"vertical"
					))
					errorQueue.push(sharpener(
						left,
						right,
						(a,b) => create_horizontal_gradient(a,b,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"horizontal"
					))

					errorQueue.push(sharpener(
						NW,
						SE,
						(a,b) => create_diagonal_gradient(a,b,false,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_NW"
					))
					errorQueue.push(sharpener(
						NE,
						SW,
						(a,b) => create_diagonal_gradient(a,b,true,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_NE"
					))

					errorQueue.push(sharpener(
						NW_s,
						SE_s,
						(a,b) => create_diagonal_solid(a,b,false,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_solid_NW"
					))
					errorQueue.push(sharpener(
						NE_s,
						SW_s,
						(a,b) => create_diagonal_solid(a,b,true,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_solid_NE"
					))

					errorQueue.push(sharpener(
						NW_s,
						SE,
						(a,b) => create_diagonal_half_solid(a,b,0,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_half_NW"
					))
					errorQueue.push(sharpener(
						NE_s,
						SW,
						(a,b) => create_diagonal_half_solid(a,b,1,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_half_NE"
					))
					errorQueue.push(sharpener(
						SE_s,
						NW,
						(a,b) => create_diagonal_half_solid(a,b,2,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_half_SE"
					))
					errorQueue.push(sharpener(
						SW_s,
						NE,
						(a,b) => create_diagonal_half_solid(a,b,3,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"diagonal_half_SW"
					))

					errorQueue.push(sharpener(
						steep_NW,
						steep_SE,
						(a,b) => create_odd_solid(a,b,false,true,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"steep_NW"
					))

					errorQueue.push(sharpener(
						calm_NW,
						calm_SE,
						(a,b) => create_odd_solid(a,b,false,false,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"calm_NW"
					))

					errorQueue.push(sharpener(
						steep_NE,
						steep_SW,
						(a,b) => create_odd_solid(a,b,true,true,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"steep_NE"
					))

					errorQueue.push(sharpener(
						calm_NE,
						calm_SW,
						(a,b) => create_odd_solid(a,b,true,false,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"calm_NE"
					))
					if(options.useDCT){
						errorQueue.push(sharpener(
							top,
							bottom,
							(a,b) => create_dct(a,b,0,1,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct01"
						))
						errorQueue.push(sharpener(
							left,
							right,
							(a,b) => create_dct(a,b,1,0,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct10"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,0,3),
							(a,b) => create_dct(a,b,0,3,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct03"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,3,0),
							(a,b) => create_dct(a,b,3,0,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct30"
						))

						errorQueue.push(sharpener(
							top,
							middle_horizontal,
							(a,b) => create_dct(a,b,0,2,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct02"
						))
						errorQueue.push(sharpener(
							left,
							middle_vertical,
							(a,b) => create_dct(a,b,2,0,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct20"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,2,3),
							(a,b) => create_dct(a,b,2,3,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct23"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,3,2),
							(a,b) => create_dct(a,b,3,2,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct32"
						))

						errorQueue.push(sharpener(
							corner_NW_SE,
							corner_NE_SW,
							(a,b) => create_dct(a,b,1,1,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct11"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,2,2),
							(a,b) => create_dct(a,b,2,2,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct22"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,3,3),
							(a,b) => create_dct(a,b,3,3,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct33"
						))
						errorQueue.push(sharpener(
							corner_NW_SE,
							corner_NE_SW,
							(a,b) => create_dct(a,b,1,2,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct12"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,1,3),
							(a,b) => create_dct(a,b,1,3,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct13"
						))
						errorQueue.push(sharpener(
							corner_NW_SE,
							corner_NE_SW,
							(a,b) => create_dct(a,b,2,1,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct21"
						))
						errorQueue.push(sharpener(
							...asample_dct(chunck,3,1),
							(a,b) => create_dct(a,b,3,1,curr.size),
							patch => error_compare(chunck,patch,curr.x,curr.y),
							"dct31"
						))
					}
					errorQueue.push(sharpener(
						corner_NW_SE,
						skraa_NE_SW,
						(a,b) => create_dip(a,b,false,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dip_NW"
					))
					errorQueue.push(sharpener(
						corner_NE_SW,
						skraa_NW_SE,
						(a,b) => create_dip(a,b,true,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"dip_NE"
					))
					errorQueue.push(sharpener(
						left_third_large,
						right_third_small,
						(a,b) => create_third(a,b,false,true,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"horizontal_large_third"
					))
					errorQueue.push(sharpener(
						left_third_small,
						right_third_large,
						(a,b) => create_third(a,b,false,false,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"horizontal_third"
					))
					errorQueue.push(sharpener(
						top_third_large,
						bottom_third_small,
						(a,b) => create_third(a,b,true,true,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"vertical_large_third"
					))
					errorQueue.push(sharpener(
						top_third_small,
						bottom_third_large,
						(a,b) => create_third(a,b,true,false,curr.size),
						patch => error_compare(chunck,patch,curr.x,curr.y),
						"vertical_third"
					))
				}

				let TOPLEFT_equal = mArr[0] === mArr[1] && mArr[0] === mArr[4] && mArr[0] === mArr[5];
				let TOPRIGHT_equal = mArr[2] === mArr[3] && mArr[2] === mArr[6] && mArr[2] === mArr[7];
				let BOTTOMLEFT_equal = mArr[8] === mArr[9] && mArr[8] === mArr[12] && mArr[8] === mArr[13];
				let BOTTOMRIGHT_equal = mArr[10] === mArr[11] && mArr[10] === mArr[14] && mArr[10] === mArr[15];


				errorQueue.sort((a,b) => a.error - b.error || a.colours.length - b.colours.length);
				if(errorQueue[0].error <= localQuantizer){
					if(
						curr.size === 4
						|| errorQueue[0].error === 0
						|| table_ceiling < 10
						|| ["whole","PREVIOUS","PREVIOUS2","PREVIOUS3","PREVIOUS4","PREVIOUS5","PREVIOUS6","PREVIOUS7","PREVIOUS8","PREVIOUS9","PREVIOUS10"].includes(errorQueue[0].symbol)
						|| !(
							(TOPLEFT_equal && TOPRIGHT_equal)
							|| (BOTTOMLEFT_equal && BOTTOMRIGHT_equal)
							|| (TOPRIGHT_equal && BOTTOMRIGHT_equal)
							|| (TOPLEFT_equal && BOTTOMLEFT_equal)
						)
						|| (errorQueue[0].symbol === "horizontal_large_third" && (TOPLEFT_equal && BOTTOMLEFT_equal))
						|| (errorQueue[0].symbol === "horizontal_third" && (TOPRIGHT_equal && BOTTOMRIGHT_equal))
						|| (errorQueue[0].symbol === "vertical_large_third" && (TOPLEFT_equal && TOPRIGHT_equal))
						|| (errorQueue[0].symbol === "vertical_third" && (BOTTOMLEFT_equal && BOTTOMRIGHT_equal))
					){
						let nextPassed = true;
						if(curr.size > 4 && errorQueue[0].error > localQuantizer * 0.8){
							if(sharpener(
								top_third_large,
								bottom_third_large,
								(a,b) => create_vertical_dummy(a,b,curr.size),
								patch => error_compare(chunck,patch,curr.x,curr.y),
								"vertical_dummy"
							).error < errorQueue[0].error){
								nextPassed = false
							}
							else if(sharpener(
								left_third_large,
								right_third_large,
								(a,b) => create_horizontal_dummy(a,b,curr.size),
								patch => error_compare(chunck,patch,curr.x,curr.y),
								"horizontal_dummy"
							).error < errorQueue[0].error){
								nextPassed = false
							}
						}
						if(nextPassed){
							try{
								writeLargeSymbol(errorQueue[0].symbol,curr.size === 4);
								if(table_ceiling === 2){
									if(errorQueue[0].colours.length){
										writeByte(errorQueue[0].colours[0])
									}
								}
								else{
									errorQueue[0].colours.forEach(colour => {
										writeByte(colour);
									})
								}
								for(let i=0;i < curr.size && (i + curr.x) < width;i++){
									for(let j=0;j < curr.size && (j + curr.y) < height;j++){
										currentEncode[i + curr.x][j + curr.y] = errorQueue[0].patch[i][j]
									}
								}
								previous2x2_curr.push({
									x: curr.x + 2,
									y: curr.y + curr.size - 2,
									size: 2
								})
								previous2x2_curr.push({
									x: curr.x,
									y: curr.y + curr.size - 2,
									size: 2
								});
								continue
							}
							catch(e){
								console.log(errorQueue[0]);
								throw "why???"
							}
						}
					}
				}
				writeLargeSymbol("divide",curr.size === 4);
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
				if(table_ceiling === 2){
					writeSymbol((chunck[0][0] << 3) + (chunck[1][0] << 2) + (chunck[1][1] << 1) + chunck[0][1]);
					write_chunck(curr,chunck);
					continue
				}
				previous2x2_curr.push(curr);
				while(previous2x2_curr.length > 3){
					previous2x2_curr.shift()
				}
				/*let chunck_previous1;
				let chunck_previous2;
				if(previous2x2_curr.length > 1){
					chunck_previous1 = get_chunck_encode(previous2x2_curr[previous2x2_curr.length - 2].x,previous2x2_curr[previous2x2_curr.length - 2].y,2);
					if(
						chunck[0][0] === chunck_previous1[0][0]
						&& chunck[1][0] === chunck_previous1[1][0]
						&& chunck[0][1] === chunck_previous1[0][1]
						&& chunck[1][1] === chunck_previous1[1][1]
					){
						writeSymbol("PREVIOUS");
						write_chunck(curr,chunck);
						continue;
					}
				}
				if(previous2x2_curr.length > 2){
					chunck_previous2 = get_chunck_encode(previous2x2_curr[previous2x2_curr.length - 3].x,previous2x2_curr[previous2x2_curr.length - 3].y,2);
					if(
						chunck[0][0] === chunck_previous2[0][0]
						&& chunck[1][0] === chunck_previous2[1][0]
						&& chunck[0][1] === chunck_previous2[0][1]
						&& chunck[1][1] === chunck_previous2[1][1]
					){
						writeSymbol("PREVIOUS2");
						write_chunck(curr,chunck);
						continue;
					}
				}*/
				let avg = Math.round((chunck[0][0] + chunck[1][0] + chunck[0][1] + chunck[1][1])/4);
				let whole_patch = [[avg,avg],[avg,avg]];
				let wholeError = error_compare(whole_patch,chunck,curr.x,curr.y);

				if(
					wholeError === 0
				){
					writeSymbol("whole");
					writeByte(chunck[0][0]);
					write_chunck(curr,chunck);
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][1] === chunck[1][1]
				){
					writeSymbol("vertical");
					writeByte(chunck[0][0]);
					writeByte(chunck[0][1])
					write_chunck(curr,chunck);
					continue
				}
				if(
					chunck[0][0] === chunck[0][1]
					&& chunck[1][0] === chunck[1][1]
				){
					writeSymbol("horizontal");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1])
					write_chunck(curr,chunck);
					continue
				}
				let dia1_patch = create_diagonal_gradient(chunck[0][0],chunck[1][1],false,2);
				let dia1_err = error_compare(dia1_patch,chunck,curr.x,curr.y);
				if(dia1_err === 0){
					writeSymbol("diagonal_NW");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1])
					write_chunck(curr,chunck);
					continue
				}
				let dia2_patch = create_diagonal_gradient(chunck[1][0],chunck[0][1],true,2);
				let dia2_err = error_compare(dia2_patch,chunck,curr.x,curr.y);
				if(dia2_err === 0){
					writeSymbol("diagonal_NE");
					writeByte(chunck[1][0]);
					writeByte(chunck[0][1])
					write_chunck(curr,chunck);
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSymbol("diagonal_solid_NW");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1])
					write_chunck(curr,chunck);
					continue
				}
				if(
					chunck[0][0] === chunck[1][0]
					&& chunck[0][0] === chunck[1][1]
				){
					writeSymbol("diagonal_solid_NE");
					writeByte(chunck[0][0]);
					writeByte(chunck[0][1])
					write_chunck(curr,chunck);
					continue
				}
				if(
					chunck[0][1] === chunck[1][1]
					&& chunck[1][1] === chunck[1][0]
				){
					writeSymbol("diagonal_solid_SE");
					writeByte(chunck[0][0]);
					writeByte(chunck[1][1])
					write_chunck(curr,chunck);
					continue
				}
				if(
					chunck[0][1] === chunck[1][1]
					&& chunck[0][0] === chunck[0][1]
				){
					writeSymbol("diagonal_solid_SW");
					writeByte(chunck[1][0]);
					writeByte(chunck[0][1])
					write_chunck(curr,chunck);
					continue
				}
				if(options.lossySmallGradients && c_options.quantizer){

					let errorQueue = [];
					errorQueue.push({
						symbol: "whole",
						error: wholeError * 0.9,
						patch: whole_patch,
						colours: [avg]
					})

					let upper_avg = Math.round((chunck[0][0] + chunck[1][0])/2);
					let lower_avg = Math.round((chunck[0][1] + chunck[1][1])/2);
					let left_avg = Math.round((chunck[0][0] + chunck[0][1])/2);
					let right_avg = Math.round((chunck[1][0] + chunck[1][1])/2);
					let NW_avg = Math.round((chunck[0][0] + chunck[1][0] + chunck[0][1])/3);
					let NE_avg = Math.round((chunck[0][0] + chunck[1][0] + chunck[1][1])/3);

					let SW_avg = Math.round((chunck[0][0] + chunck[0][1] + chunck[1][1])/3);
					let SE_avg = Math.round((chunck[1][0] + chunck[0][1] + chunck[1][1])/3);

					let solid1_patch = [[NW_avg,NW_avg],[NW_avg,chunck[1][1]]];
					let solid1Error = error_compare(solid1_patch,chunck,curr.x,curr.y);

					let solid2_patch = [[NE_avg,chunck[0][1]],[NE_avg,NE_avg]];
					let solid2Error = error_compare(solid2_patch,chunck,curr.x,curr.y);

					let weird1_patch = [[chunck[0][0],SE_avg],[SE_avg,SE_avg]];
					let weird1Error = error_compare(weird1_patch,chunck,curr.x,curr.y);

					let weird2_patch = [[SW_avg,SW_avg],[chunck[1][0],SW_avg]];
					let weird2Error = error_compare(weird2_patch,chunck,curr.x,curr.y);

					let lossyVertical_patch = [[upper_avg,lower_avg],[upper_avg,lower_avg]];
					let lossyVerticalError = error_compare(lossyVertical_patch,chunck,curr.x,curr.y);
					errorQueue.push({
						symbol: "vertical",
						error: lossyVerticalError,
						patch: lossyVertical_patch,
						colours: [upper_avg,lower_avg]
					})
					let lossyHorizontal_patch = [[left_avg,left_avg],[right_avg,right_avg]];
					let lossyHorizontalError = error_compare(lossyHorizontal_patch,chunck,curr.x,curr.y);
					errorQueue.push({
						symbol: "horizontal",
						error: lossyHorizontalError,
						patch: lossyHorizontal_patch,
						colours: [left_avg,right_avg]
					})
					errorQueue.push({
						symbol: "diagonal_solid_NW",
						error: solid1Error,
						patch: solid1_patch,
						colours: [NW_avg,chunck[1][1]]
					})
					errorQueue.push({
						symbol: "diagonal_solid_NE",
						error: solid2Error,
						patch: solid2_patch,
						colours: [NE_avg,chunck[0][1]]
					})
					errorQueue.push({
						symbol: "diagonal_solid_SE",
						error: weird1Error,
						patch: weird1_patch,
						colours: [chunck[0][0],SE_avg]
					})
					errorQueue.push({
						symbol: "diagonal_solid_SW",
						error: weird2Error,
						patch: weird2_patch,
						colours: [chunck[1][0],SW_avg]
					})
					errorQueue.push({
						symbol: "diagonal_NW",
						error: dia1_err,
						patch: dia1_patch,
						colours: [chunck[0][0],chunck[1][1]]
					})
					errorQueue.push({
						symbol: "diagonal_NE",
						error: dia2_err,
						patch: dia2_patch,
						colours: [chunck[1][0],chunck[0][1]]
					})
					/*if(previous2x2_curr.length > 1){
						errorQueue.push({
							symbol: "PREVIOUS",
							error: error_compare(chunck_previous1,chunck,curr.x,curr.y),
							patch: chunck_previous1,
							colours: []
						})
					}
					if(previous2x2_curr.length > 2){
						errorQueue.push({
							symbol: "PREVIOUS2",
							error: error_compare(chunck_previous2,chunck,curr.x,curr.y),
							patch: chunck_previous2,
							colours: []
						})
					}*/
					errorQueue.sort((a,b) => a.error - b.error || a.colours.length - b.colours.length);
					if(errorQueue[0].error <= c_options.quantizer){
						writeSymbol(errorQueue[0].symbol);
						errorQueue[0].colours.forEach(colour => {
							writeByte(colour);
						})
						write_chunck(curr,errorQueue[0].patch);
						continue
					}
				}
				writeSymbol("pixels");
				writeByte(chunck[0][0]);
				writeByte(chunck[1][0]);
				writeByte(chunck[1][1]);
				writeByte(chunck[0][1]);
				write_chunck(curr,chunck);
			}
		}

		if(CHANNEL_LENGTH > 1){
			if(occupied === CHANNEL_POWER){
				bitBuffer.push(0);
				bitBuffer.push(0);
			}
			else{
				if(CHANNEL_POWER < Math.min(delta_data.length,range_data.length)){
					bitBuffer.push(0);
					bitBuffer.push(1);
					console.log("using default encoding");
					bitBuffer = bitBuffer.concat(
						frequencyTable.map(ele => (ele ? 1 : 0))
					)
				}
				else if(delta_data.length < range_data.length){
					bitBuffer.push(1);
					bitBuffer.push(0);
					console.log("using delta encoding");
					bitBuffer = bitBuffer.concat(delta_data)
				}
				else{
					bitBuffer.push(1);
					bitBuffer.push(1);
					console.log("using range encoding");
					bitBuffer = bitBuffer.concat(range_data)
				}
			}
		}

		console.log("l_freq",largeSymbolFrequency);
		console.log("s_freq",smallSymbolFrequency);/*

		console.log("books",smallSymbolBook,largeSymbolBook,colourBook);*/


		/*let DEBUG_small_f = new FrequencyTable(
			smallSymbolTable.map(symbol => smallSymbolFrequency[symbol])
		);*/
		let DEBUG_small_f;
		let forigeg_small = 0;
		let predictionGrid_small = [];
		if(table_ceiling === 2){
			DEBUG_small_f = new FrequencyTable(new Array(16).fill(1));
			for(let i=0;i<16;i++){
				predictionGrid_small.push(new FrequencyTable(new Array(16).fill(1)))
			}
		}
		else{
			DEBUG_small_f = new FrequencyTable(new Array(smallSymbolTable.length).fill(1));
			for(let i=0;i<smallSymbolTable.length;i++){
				predictionGrid_small.push(new FrequencyTable(new Array(smallSymbolTable.length).fill(1)))
			}
		}
		let DEBUG_large_f = new FrequencyTable(new Array(largeSymbolTable.length).fill(1));
		let forigeg_large = 0;
		let predictionGrid_large = [];
		for(let i=0;i<largeSymbolTable.length;i++){
			predictionGrid_large.push(new FrequencyTable(new Array(largeSymbolTable.length).fill(1)))
		}

		//let DEBUG_integer_f = new FrequencyTable(new Array(table_ceiling).fill(1));
		/*let predictionGrid_integer = [];
		if(table_ceiling === 2){
			for(let i=0;i<16;i++){
				predictionGrid_integer.push(new FrequencyTable(new Array(2).fill(1)))
			}
		}
		else{
			for(let i=0;i<smallSymbolTable.length;i++){
				predictionGrid_integer.push(new FrequencyTable(new Array(table_ceiling).fill(1)))
			}
		}*/
//end debug

		let middleBuffer = [];

		let testwriter = {
			write: function(bit){
				middleBuffer.push(bit)
			},
			close: function(){}
		}

		let enc = new ArithmeticEncoder(NUM_OF_BITS, testwriter);

		let forige = 0;
		let absolutes = new Array(table_ceiling).fill(1);
		let deltas = new Array(table_ceiling).fill(1);

		let black_stat = new FrequencyTable([1,1]);
		let white_stat = new FrequencyTable([1,1]);

		let pixelTrace = [];
		let previousWas = false;
		let previousWas_large = false;
		let toot = 0;

		aritmetic_queue.forEach(waiting => {
			try{
				if(isFinite(waiting)){
					if(table_ceiling === 2){
						if(forige === 0){
							enc.write(black_stat,waiting);
							black_stat.increment(waiting);
						}
						else{
							enc.write(white_stat,waiting);
							white_stat.increment(waiting);
						}
						forige = waiting;
					}
					else{
						let encodedInteger = waiting - forige;
						if(encodedInteger < 0){
							encodedInteger += table_ceiling
						}

						let localProbability = absolutes.map((val,index) => {
							return Math.min(val,256) * deltas[(index - forige + table_ceiling) % table_ceiling]
						})
						if(previousWas === "pixels"){
							if(pixelTrace.length === 3){
								if(pixelTrace[0] === pixelTrace[1]){
									localProbability[pixelTrace[2]] = 0;
									localProbability[pixelTrace[0]] = 0
								}
								else if(pixelTrace[1] === pixelTrace[2]){
									localProbability[pixelTrace[2]] = 0;
									localProbability[pixelTrace[0]] = 0
								}
							}
							else if(pixelTrace.length === 2){
								if(pixelTrace[0] === pixelTrace[1]){
									localProbability[pixelTrace[0]] = 0
								}
							}
						}
						else if(pixelTrace.length && previousWas && previousWas !== "whole"){
							localProbability[pixelTrace[0]] = 0
						}
						else if(pixelTrace.length && previousWas_large && previousWas_large !== "whole"){
							localProbability[pixelTrace[0]] = 0
						}
						
						enc.write(
							new FrequencyTable(localProbability),
							waiting
						);
						forige = waiting;
						deltas[encodedInteger]++;
						absolutes[waiting]++;
						pixelTrace.push(waiting);
					}
				}
				else if(waiting.size === "large"){
					pixelTrace = [];
					previousWas = false;
					previousWas_large = waiting.symbol;
					let symbol = largeSymbolTable.indexOf(waiting.symbol);

					if(DEBUG_large_f.get(forigeg_large) > 128){
						enc.write(predictionGrid_large[forigeg_large],symbol)
					}
					else{
						enc.write(DEBUG_large_f,symbol)
					}

					predictionGrid_large[forigeg_large].increment(symbol);
					forigeg_large = symbol;
					DEBUG_large_f.increment(symbol);
				}
				else{
					previousWas_large = false;
					if(table_ceiling === 2){
						if(DEBUG_small_f.get(forigeg_small) > 32){
							enc.write(predictionGrid_small[forigeg_small],waiting.symbol)
						}
						else{
							enc.write(DEBUG_small_f,waiting.symbol)
						}
						if(pixelTrace.length === 3){
							if(pixelTrace[0] === pixelTrace[1] && pixelTrace[0] === pixelTrace[2]){
								toot++
							}
						}
						predictionGrid_small[forigeg_small].increment(waiting.symbol);
						forigeg_small = waiting.symbol;
						DEBUG_small_f.increment(waiting.symbol);
						pixelTrace.push(waiting.symbol)
					}
					else{
						pixelTrace = [];
						previousWas = waiting.symbol;
						let symbol = smallSymbolTable.indexOf(waiting.symbol);
						if(DEBUG_small_f.get(forigeg_small) > 64){
							enc.write(predictionGrid_small[forigeg_small],symbol)
						}
						else{
							enc.write(DEBUG_small_f,symbol)
						}

						predictionGrid_small[forigeg_small].increment(symbol);
						forigeg_small = symbol;
						DEBUG_small_f.increment(symbol);
					}
				}
			}
			catch(e){
				console.log(e,DEBUG_large_f,waiting,largeSymbolTable.indexOf(waiting.symbol));
				throw "up"
			}
		});
		
		enc.finish();
		console.log("toot",toot)
		//console.log(DEBUG_integer_f)

		bitBuffer = bitBuffer.concat(encodeVarint(middleBuffer.length,BYTE_LENGTH));
		
		bitBuffer = bitBuffer.concat(middleBuffer);

		if(c_options.name === "alpha" && frequencyTable[0] && options.fullTransparancyOptimization){
			hasAlphaMap = true;
			alphaMap = currentEncode.map(row => row.map(val => val === 0))
		}

		return bitBuffer
	}

	if(options.target_pixelFormat === "yiq26a"){
		bitBuffer = bitBuffer.concat(encodeChannel(channels[3],{
			bitDepth: 8,
			name: "alpha",
			quantizer: 0
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[1],{
			bitDepth: 9,
			name: "I",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[2],{
			bitDepth: 9,
			name: "Q",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "yiq26"){
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[1],{
			bitDepth: 9,
			name: "I",
			quantizer: options.colourQuantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[2],{
			bitDepth: 9,
			name: "Q",
			quantizer: options.colourQuantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "ycocg"){
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[1],{
			bitDepth: 8,
			name: "Co",
			quantizer: options.colourQuantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[2],{
			bitDepth: 8,
			name: "Cg",
			quantizer: options.colourQuantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "ycocga"){
		bitBuffer = bitBuffer.concat(encodeChannel(channels[3],{
			bitDepth: 8,
			name: "alpha",
			quantizer: 0
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[1],{
			bitDepth: 8,
			name: "Co",
			quantizer: options.colourQuantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[2],{
			bitDepth: 8,
			name: "Cg",
			quantizer: options.colourQuantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "rgba"){
		bitBuffer = bitBuffer.concat(encodeChannel(channels[3],{
			bitDepth: 8,
			name: "alpha",
			quantizer: 0
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[1],{
			bitDepth: 8,
			name: "g",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 8,
			name: "r",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[2],{
			bitDepth: 8,
			name: "b",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "greyscale"){
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 8,
			name: "Y",
			quantizer: options.quantizer
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "bit"){
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 1,
			name: "bitmap",
			quantizer: 0
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "indexed"){
		if(c_index.length === 1){//can be encoded as a whole block, no need to limit block size
			options.maxBlockSize = encoding_size
		}
		const luma_compare = (a,b) => a[0] * 0.299 + a[1] * 0.587 + a[2] * 0.114 - b[0]* 0.299 - b[1]* 0.587 - b[2] * 0.114;
		if(options.multiPassIndexed && options.quantizer === 0){
			c_index.sort(luma_compare);
			let lumaData = rgb_to_indexed(imageData,c_index);
			let luma_buffer = encodeChannel(deMultiplexChannels(lumaData,width,height)[0],{
				bitDepth: 8,
				name: "indexed",
				quantizer: options.quantizer,
				indexed: true,
				c_index: c_index
			})
			let red_bin = [];
			let green_bin = [];
			let blue_bin = [];
			c_index.forEach(colour => {
				if(colour[0] > colour[1] && colour[0] > colour[2]){
					red_bin.push(colour)
				}
				else if(colour[1] > colour[2]){
					green_bin.push(colour)
				}
				else{
					blue_bin.push(colour)
				}
			});
			let c_index2 = red_bin.sort(luma_compare).concat(green_bin.sort(luma_compare)).concat(blue_bin.sort(luma_compare));
			let lumaData2 = rgb_to_indexed(imageData,c_index2);
			let luma_buffer2 = encodeChannel(deMultiplexChannels(lumaData2,width,height)[0],{
				bitDepth: 8,
				name: "indexed",
				quantizer: options.quantizer,
				indexed: true,
				c_index: c_index2
			})
			if(luma_buffer.length <= luma_buffer2.length){
				bitBuffer = bitBuffer.concat(luma_buffer)
			}
			else{
				bitBuffer = bitBuffer.concat(luma_buffer2);
				console.log(`using optimized palette (${Math.round(100*(1 - luma_buffer2.length/luma_buffer.length))}% smaller)`)
			}
		}
		else{
			c_index.sort(luma_compare);
			imageData = rgb_to_indexed(imageData,c_index);
			bitBuffer = bitBuffer.concat(encodeChannel(deMultiplexChannels(imageData,width,height)[0],{
				bitDepth: 8,
				name: "indexed",
				quantizer: options.quantizer,
				indexed: true,
				c_index: c_index
			}))
		}
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(options.target_pixelFormat === "indexeda"){
		if(c_index.length === 1){//can be encoded as a whole block, no need to limit block size
			options.maxBlockSize = encoding_size
		}
		bitBuffer = bitBuffer.concat(encodeChannel(channels[0],{
			bitDepth: 8,
			name: "indexeda",
			quantizer: options.quantizer,
			indexeda: true,
			c_index: c_index
		}))
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}


	if(bitBuffer.length){
		while(bitBuffer.length < 8){
			bitBuffer.push(0)
		}
		encodedData.push(dePlex(bitBuffer.splice(0,8)))
	}

	if(
		options.pixelFormat === "rgb"
		&& options.target_pixelFormat === "yiq26"
		&& encodedData.length > (9 + width * height * 3)
	){
		console.log("bailing out to raw rgb data");
		encodedData = [];
		bitBuffer = [];
		writeByteNative(72);writeByteNative(79);writeByteNative(72);
		bitBuffer.push(...encodeVarint(width,BYTE_LENGTH));
		bitBuffer.push(...encodeVarint(height,BYTE_LENGTH));
		writeByteNative(internal_formats.indexOf("verbatim"));
		bitBuffer.push(...encodeVarint(0,BYTE_LENGTH));

		yiq26_to_rgb(imageData).forEach(byte => writeByteNative(byte));
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(
		options.target_pixelFormat === "greyscale"
		&& encodedData.length > (9 + width * height)
	){
		console.log("bailing out to raw greyscale data");
		encodedData = [];
		bitBuffer = [];
		writeByteNative(72);writeByteNative(79);writeByteNative(72);
		bitBuffer.push(...encodeVarint(width,BYTE_LENGTH));
		bitBuffer.push(...encodeVarint(height,BYTE_LENGTH));
		writeByteNative(internal_formats.indexOf("verbatimgreyscale"));
		bitBuffer.push(...encodeVarint(0,BYTE_LENGTH));

		imageData.forEach(byte => writeByteNative(byte));
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}
	else if(
		options.target_pixelFormat === "bit"
		&& encodedData.length > (9 + Math.ceil(width * height/8))
	){
		console.log("bailing out to raw bit image data");
		encodedData = [];
		bitBuffer = [];
		writeByteNative(72);writeByteNative(79);writeByteNative(72);
		bitBuffer.push(...encodeVarint(width,BYTE_LENGTH));
		bitBuffer.push(...encodeVarint(height,BYTE_LENGTH));
		writeByteNative(internal_formats.indexOf("verbatimbit"));
		bitBuffer.push(...encodeVarint(0,BYTE_LENGTH));

		bitBuffer = bitBuffer.concat(imageData);
		while(bitBuffer.length > 7){
			encodedData.push(dePlex(bitBuffer.splice(0,8)))
		}
	}

	let t1 = performance.now()
	console.log("Encoding took " + (t1 - t0) + " milliseconds")

	return Uint8Array.from(encodedData)
}

function decoder(hohData,options){
	console.info("DECODING");
	if(!options){
		return{
			imageData: null,
			error: "usage: decoder(hohData,options)"
		}
	}
	if(!options.pixelFormat){
		return{
			imageData: null,
			error: "a pixelFormat is required. Use decoder(hohData,{pixelFormat: 'rgba'}} if unsure"
		}
	}
	if(!["rgba","yiq26a"].includes(options.pixelFormat)){
		return{
			imageData: null,
			error: "only rgba or yiq26a supported for pixelFormat"
		}
	}
	if(hohData.length < 7){
		return{
			imageData: null,
			error: "data does not contain required header"
		}
	}
	let currentIndex = 1;
	let bitBuffer = rePlex(hohData[0]);
	let readByteNative = function(){
		if(currentIndex < hohData.length){
			bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
		}
		else if(bifBuffer.length < BYTE_LENGTH){
			throw "unexpeced end of file"
		}
		return dePlex(bitBuffer.splice(0,BYTE_LENGTH))
	}
	let readBit = function(){
		if(bitBuffer.length === 0){
			if(currentIndex < hohData.length){
				bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
			}
			else{
				throw "unexpeced end of file"
			}
		}
		return bitBuffer.splice(0,1)[0]
	}
	if(!(readByteNative() === 72 && readByteNative() === 79 && readByteNative() === 72)){
		return{
			imageData: null,
			error: "not a hoh image. Signature does not match"
		}
	}
	let readVarint = function(base){
		if(!base){
			base = BYTE_LENGTH
		}
		let buffer = [];
		while(readBit()){
			if(bitBuffer.length < (BYTE_LENGTH - 1)){
				bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
			}
			buffer = buffer.concat(bitBuffer.splice(0,BYTE_LENGTH - 1))
		}
		if(bitBuffer.length < (BYTE_LENGTH - 1)){
			bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
		}
		buffer = buffer.concat(bitBuffer.splice(0,BYTE_LENGTH - 1));
		return dePlex(buffer);
	}
	const width = readVarint(BYTE_LENGTH);
	const height = readVarint(BYTE_LENGTH);

	const encoding_size = Math.pow(2,Math.ceil(Math.log2(Math.max(width,height))));

	let pixelFormat = internal_formats[readByteNative()];

	console.log(width,height,pixelFormat);

	let frames = readVarint(BYTE_LENGTH);
	if(frames !== 0){
		throw "animation decoding not supported"
	}

	let channels = [];

	let botchedFlag = false;

	let decodeChannel = function(options){
		const CHANNEL_LENGTH = options.bitDepth;
		const CHANNEL_POWER = Math.pow(2,CHANNEL_LENGTH);
		const CHANNEL_MAX_VAL = CHANNEL_POWER - 1;

		let c_index = [];
		if(options.indexed){
			let indexNumber = readByteNative() + 1;
			for(let i=0;i<indexNumber;i++){
				c_index.push([readByteNative(),readByteNative(),readByteNative()])
			}
		}
		else if(options.indexeda){
			let indexNumber = readByteNative() + 1;
			for(let i=0;i<indexNumber;i++){
				c_index.push([readByteNative(),readByteNative(),readByteNative(),readByteNative()])
			}
		}

		const PRIMITIVE = primitive_huffman(CHANNEL_POWER);

		let readDelta = function(){
			let head = PRIMITIVE;
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

		if(!options.fallBack){
			options.fallback = 0
		}

		let imageData = [];
		let currentEncode = [];
		for(let i=0;i<width;i++){
			imageData.push(new Array(height).fill(options.fallBack))
		}
		let translationTable = [];
		try{
			if(CHANNEL_LENGTH > 1){
				let flagBit1 = readBit();
				let flagBit2 = readBit();
				console.log(flagBit1,flagBit2);

				if(flagBit1 === 1 && flagBit2 === 1){
					console.log("detected range encoding");
					while(bitBuffer.length < (CHANNEL_LENGTH - 1) && currentIndex < hohData.length){
						bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
					}
					let ranges = dePlex(bitBuffer.splice(0,CHANNEL_LENGTH - 1));
					let deltas = [];
					for(let i=0;i<ranges*2;i++){
						deltas.push(parseInt(readDelta()) + 1)
					};
					let colourAllowable;
					let rangeActive = false;
					deltas.forEach((delta,index) => {
						if(index === 0){
							colourAllowable = new Array(delta - 1).fill(rangeActive)
						}
						else{
							colourAllowable = colourAllowable.concat(new Array(delta).fill(rangeActive))
						}
						rangeActive = !rangeActive
					});
					colourAllowable.forEach((val,index) => {
						if(val){
							translationTable.push(index)
						}
					})
				}
				else if(flagBit1 === 1 && flagBit2 === 0){
					while(bitBuffer.length < CHANNEL_LENGTH && currentIndex < hohData.length){
						bitBuffer = bitBuffer.concat(rePlex(hohData[currentIndex++]))
					}
					let occupied = dePlex(bitBuffer.splice(0,CHANNEL_LENGTH));
					let deltas = [];
					for(let i=0;i<occupied;i++){
						deltas.push(parseInt(readDelta()) + 1)
					};
					let colourAllowable = [];
					deltas.forEach((delta,index) => {
						colourAllowable = colourAllowable.concat(new Array(delta - 1).fill(false))
						colourAllowable.push(true)
					});
					colourAllowable.forEach((val,index) => {
						if(val){
							translationTable.push(index)
						}
					})
				}
				else if(flagBit1 === 0 && flagBit2 === 0){
					for(let i=0;i<CHANNEL_POWER;i++){
						translationTable.push(i)
					}
				}
				else if(flagBit1 === 0 && flagBit2 === 1){
					for(let i=0;i<CHANNEL_POWER;i++){
						if(readBit()){
							translationTable.push(i)
						}
					}
				}
			}
			else{
				translationTable = [0,1]
			}
		}
		catch(e){
			console.log("error in tables");
			console.log(e);
			botchedFlag = true;
			return imageData
		}
		try{
			let table_ceiling = translationTable.length;
			console.log("d table ceiling",table_ceiling);
			for(let i=0;i<width;i++){
				currentEncode.push(new Array(height).fill(0))
			}

			function get_chunck(x,y,size){
				let data = [];
				for(let i=x;i<x + size;i++){
					let col = [];
					if(i >= width){
						for(let j=y;j<y + size;j++){
							col.push(currentEncode[width - 1][j] || currentEncode[width - 1][height - 1])
						}
					}
					else{
						for(let j=y;j<y + size;j++){
							if(j >= height){
								col.push(currentEncode[i][height - 1])
							}
							else{
								col.push(currentEncode[i][j])
							}
						}
					}
					data.push(col)
				}
				return data
			}

			let DEBUG_small_f;
			let forigeg_small = 0;
			let predictionGrid_small = [];
			if(table_ceiling === 2){
				DEBUG_small_f = new FrequencyTable(new Array(16).fill(1));
				for(let i=0;i<16;i++){
					predictionGrid_small.push(new FrequencyTable(new Array(16).fill(1)))
				}
			}
			else{
				DEBUG_small_f = new FrequencyTable(new Array(smallSymbolTable.length).fill(1));
				for(let i=0;i<smallSymbolTable.length;i++){
					predictionGrid_small.push(new FrequencyTable(new Array(smallSymbolTable.length).fill(1)))
				}
			}
			let DEBUG_large_f = new FrequencyTable(new Array(largeSymbolTable.length).fill(1));
			let forigeg_large = 0;
			let predictionGrid_large = [];
			for(let i=0;i<largeSymbolTable.length;i++){
				predictionGrid_large.push(new FrequencyTable(new Array(largeSymbolTable.length).fill(1)))
			}


			let max_reads = readVarint(BYTE_LENGTH);

			let debug_reads = 0;
			let testreader = {
				read: function(){
					debug_reads++;
					if(debug_reads <= max_reads){
						return readBit()
					}
					else{
						return -1
					}
				},
				close: function(){}
			}

			let dec = new ArithmeticDecoder(NUM_OF_BITS, testreader);

			let pixelTrace = [];
			let previousWas = false;
			let previousWas_large = false;

			let readLargeSymbol = function(){
				previousWas = false;
				pixelTrace = [];
				let symbol;
				if(DEBUG_large_f.get(forigeg_large) > 128){
					symbol = dec.read(predictionGrid_large[forigeg_large])
				}
				else{
					symbol = dec.read(DEBUG_large_f)
				}
				DEBUG_large_f.increment(symbol);
				predictionGrid_large[forigeg_large].increment(symbol);
				forigeg_large = symbol;
				previousWas_large = largeSymbolTable[symbol];
				return previousWas_large
			}

			let readSmallSymbol = function(){
				previousWas_large = false;
				pixelTrace = [];
				let symbol;
				if(DEBUG_small_f.get(forigeg_small) > 64){
					symbol = dec.read(predictionGrid_small[forigeg_small])
				}
				else{
					symbol = dec.read(DEBUG_small_f)
				}
				DEBUG_small_f.increment(symbol);
				predictionGrid_small[forigeg_small].increment(symbol);
				forigeg_small = symbol;
				previousWas = smallSymbolTable[symbol];
				return previousWas
			};

			if(table_ceiling === 2){
				readSmallSymbol = function(){
					let symbol;
					if(DEBUG_small_f.get(forigeg_small) > 32){
						symbol = dec.read(predictionGrid_small[forigeg_small])
					}
					else{
						symbol = dec.read(DEBUG_small_f)
					}
					DEBUG_small_f.increment(symbol);
					predictionGrid_small[forigeg_small].increment(symbol);
					forigeg_small = symbol;
					return symbol
				}
			}

			let forige = 0;
			let absolutes = new Array(table_ceiling).fill(1);
			let deltas = new Array(table_ceiling).fill(1);

			let readColour = function(){
				
				let localProbability = absolutes.map((val,index) => {
					return Math.min(val,256) * deltas[(index - forige + table_ceiling) % table_ceiling]
				})
				if(previousWas === "pixels"){
					if(pixelTrace.length === 3){
						if(pixelTrace[0] === pixelTrace[1]){
							localProbability[pixelTrace[2]] = 0;
							localProbability[pixelTrace[0]] = 0
						}
						else if(pixelTrace[1] === pixelTrace[2]){
							localProbability[pixelTrace[2]] = 0;
							localProbability[pixelTrace[0]] = 0
						}
					}
					else if(pixelTrace.length === 2){
						if(pixelTrace[0] === pixelTrace[1]){
							localProbability[pixelTrace[0]] = 0
						}
					}
				}
				else if(pixelTrace.length && previousWas && previousWas !== "whole"){
					localProbability[pixelTrace[0]] = 0
				}
				else if(pixelTrace.length && previousWas_large && previousWas_large !== "whole"){
					localProbability[pixelTrace[0]] = 0
				}

				let symbol = dec.read(new FrequencyTable(localProbability));
				let encodedInteger = (symbol - forige + table_ceiling) % table_ceiling;
				forige = symbol;
				deltas[encodedInteger]++;
				absolutes[symbol]++;
				pixelTrace.push(symbol)
				return symbol
			}

			if(table_ceiling === 2){
				let black_stat = new FrequencyTable([1,1]);
				let white_stat = new FrequencyTable([1,1]);
				readColour = function(){
					let symbol;
					if(forige === 0){
						symbol = dec.read(black_stat);
						black_stat.increment(symbol);
					}
					else{
						symbol = dec.read(white_stat);
						white_stat.increment(symbol);
					}
					forige = symbol;
					return symbol
				}
			}

			let write2x2 = function(curr,a,b,c,d){
				if(curr.x + 1 < width){
					if(curr.y + 1 < height){
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
						currentEncode[curr.x + 1][curr.y] = (currentEncode[curr.x + 1][curr.y] + b) % table_ceiling;
						currentEncode[curr.x + 1][curr.y + 1] = (currentEncode[curr.x + 1][curr.y + 1] + c) % table_ceiling;
						currentEncode[curr.x][curr.y + 1] = (currentEncode[curr.x][curr.y + 1] + d) % table_ceiling;
					}
					else{
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
						currentEncode[curr.x + 1][curr.y] = (currentEncode[curr.x + 1][curr.y] + b) % table_ceiling;
					}
				}
				else{
					if(curr.y + 1 < height){
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
						currentEncode[curr.x][curr.y + 1] = (currentEncode[curr.x][curr.y + 1] + d) % table_ceiling;
					}
					else{
						currentEncode[curr.x][curr.y] = (currentEncode[curr.x][curr.y] + a) % table_ceiling;
					}
				}
			}

			let previous2x2_curr = [];
			let previous4x4_curr = [];
			let previous8x8_curr = [];
			let previous16x16_curr = [];
			let previous32x32_curr = [];

			let blockQueue = [{x: 0,y:0, size: encoding_size}];

			let debug_passed = false;

		try{
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

					if(curr.size >= 4){
						previous4x4_curr.push({
							x: curr.x,
							y: curr.y + curr.size - 4,
							size: 4
						})
						if(previous4x4_curr.length > 15){
							previous4x4_curr.shift()
						}
					}
					if(curr.size >= 8){
						previous8x8_curr.push({
							x: curr.x,
							y: curr.y + curr.size - 8,
							size: 8
						})
						if(previous8x8_curr.length > 15){
							previous8x8_curr.shift()
						}
					}
					if(curr.size >= 16){
						previous16x16_curr.push({
							x: curr.x,
							y: curr.y + curr.size - 16,
							size: 16
						})
						if(previous16x16_curr.length > 15){
							previous16x16_curr.shift()
						}
					}
					if(curr.size >= 32){
						previous32x32_curr.push({
							x: curr.x,
							y: curr.y + curr.size - 32,
							size: 32
						})
						if(previous32x32_curr.length > 15){
							previous32x32_curr.shift()
						}
					}
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
						});
						continue
					}
					previous2x2_curr.push({
						x: curr.x + 2,
						y: curr.y + curr.size - 2,
						size: 2
					})
					previous2x2_curr.push({
						x: curr.x,
						y: curr.y + curr.size - 2,
						size: 2
					})
					if(instruction === "PREVIOUS"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 2].x,previous4x4_curr[previous4x4_curr.length - 2].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 2].x,previous8x8_curr[previous8x8_curr.length - 2].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 2].x,previous16x16_curr[previous16x16_curr.length - 2].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 2].x,previous32x32_curr[previous32x32_curr.length - 2].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS2"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 3].x,previous4x4_curr[previous4x4_curr.length - 3].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 3].x,previous8x8_curr[previous8x8_curr.length - 3].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 3].x,previous16x16_curr[previous16x16_curr.length - 3].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 3].x,previous32x32_curr[previous32x32_curr.length - 3].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS3"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 4].x,previous4x4_curr[previous4x4_curr.length - 4].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 4].x,previous8x8_curr[previous8x8_curr.length - 4].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 4].x,previous16x16_curr[previous16x16_curr.length - 4].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 4].x,previous32x32_curr[previous32x32_curr.length - 4].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS4"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 5].x,previous4x4_curr[previous4x4_curr.length - 5].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 5].x,previous8x8_curr[previous8x8_curr.length - 5].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 5].x,previous16x16_curr[previous16x16_curr.length - 5].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 5].x,previous32x32_curr[previous32x32_curr.length - 5].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS5"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 6].x,previous4x4_curr[previous4x4_curr.length - 6].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 6].x,previous8x8_curr[previous8x8_curr.length - 6].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 6].x,previous16x16_curr[previous16x16_curr.length - 6].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 6].x,previous32x32_curr[previous32x32_curr.length - 6].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS6"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 7].x,previous4x4_curr[previous4x4_curr.length - 7].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 7].x,previous8x8_curr[previous8x8_curr.length - 7].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 7].x,previous16x16_curr[previous16x16_curr.length - 7].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 7].x,previous32x32_curr[previous32x32_curr.length - 7].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS7"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 8].x,previous4x4_curr[previous4x4_curr.length - 8].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 8].x,previous8x8_curr[previous8x8_curr.length - 8].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 8].x,previous16x16_curr[previous16x16_curr.length - 8].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 8].x,previous32x32_curr[previous32x32_curr.length - 8].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS8"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 9].x,previous4x4_curr[previous4x4_curr.length - 9].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 9].x,previous8x8_curr[previous8x8_curr.length - 9].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 9].x,previous16x16_curr[previous16x16_curr.length - 9].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 9].x,previous32x32_curr[previous32x32_curr.length - 9].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS9"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 10].x,previous4x4_curr[previous4x4_curr.length - 10].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 10].x,previous8x8_curr[previous8x8_curr.length - 10].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 10].x,previous16x16_curr[previous16x16_curr.length - 10].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 10].x,previous32x32_curr[previous32x32_curr.length - 10].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "PREVIOUS10"){
						let chunck_previous;
						if(curr.size === 4){
							chunck_previous = get_chunck(previous4x4_curr[previous4x4_curr.length - 11].x,previous4x4_curr[previous4x4_curr.length - 11].y,4)
						}
						else if(curr.size === 8){
							chunck_previous = get_chunck(previous8x8_curr[previous8x8_curr.length - 11].x,previous8x8_curr[previous8x8_curr.length - 11].y,8)
						}
						else if(curr.size === 16){
							chunck_previous = get_chunck(previous16x16_curr[previous16x16_curr.length - 11].x,previous16x16_curr[previous16x16_curr.length - 11].y,16)
						}
						else if(curr.size === 32){
							chunck_previous = get_chunck(previous32x32_curr[previous32x32_curr.length - 11].x,previous32x32_curr[previous32x32_curr.length - 11].y,32)
						}
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = chunck_previous[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "whole"){
						let solid = readColour();
						for(let i=curr.x;i<curr.x + curr.size && i < width;i++){
							for(let j=curr.y;j<curr.y + curr.size && j < height;j++){
								currentEncode[i][j] = solid
							}
						}

					}
					else if(instruction === "horizontal"){
						let left = readColour();
						let right;
						if(table_ceiling === 2){
							right = +!left
						}
						else{
							right = readColour()
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = Math.round(left + (right - left) * (i - curr.x) /(curr.size - 1))
							}
						}
					}
					else if(instruction === "vertical"){
						let top = readColour();
						let bottom;
						if(table_ceiling === 2){
							bottom = +!top
						}
						else{
							bottom = readColour()
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = Math.round(top + (bottom - top) * (j - curr.y) /(curr.size - 1))
							}
						}
					}
					else if(instruction === "diagonal_NW"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = Math.round(colour1 + (colour2 - colour1) * ((i - curr.x) + (j - curr.y))/(2*curr.size - 2))
							}
						}
					}
					else if(instruction === "diagonal_NE"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = Math.round(colour1 + (colour2 - colour1) * ((curr.size - (i - curr.x) - 1) + (j - curr.y))/(2*curr.size - 2))
							}
						}
					}
					else if(instruction === "diagonal_solid_NW"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								if(
									i + j - curr.x - curr.y < curr.size
								){
									currentEncode[i][j] = colour1
								}
								else{
									currentEncode[i][j] = colour2
								}
							}
						}
					}
					else if(instruction === "diagonal_solid_NE"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								if(
									(curr.size - (i - curr.x) - 1) + j - curr.y < curr.size
								){
									currentEncode[i][j] = colour1
								}
								else{
									currentEncode[i][j] = colour2
								}
							}
						}
					}
					else if(instruction === "diagonal_half_NW"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_diagonal_half_solid(colour1,colour2,0,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "diagonal_half_NE"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_diagonal_half_solid(colour1,colour2,1,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "diagonal_half_SE"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_diagonal_half_solid(colour1,colour2,2,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "diagonal_half_SW"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_diagonal_half_solid(colour1,colour2,3,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "steep_NW"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_odd_solid(colour1,colour2,false,true,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "calm_NW"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_odd_solid(colour1,colour2,false,false,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "steep_NE"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_odd_solid(colour1,colour2,true,true,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "calm_NE"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_odd_solid(colour1,colour2,true,false,curr.size)
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "dip_NW"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_dip(colour1,colour2,false,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "dip_NE"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_dip(colour1,colour2,true,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "horizontal_third"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_third(colour1,colour2,false,false,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y];
							}
						}
					}
					else if(instruction === "horizontal_large_third"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_third(colour1,colour2,false,true,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "vertical_third"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_third(colour1,colour2,true,false,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction === "vertical_large_third"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_third(colour1,colour2,true,true,curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y]
							}
						}
					}
					else if(instruction.substring(0,3) === "dct"){
						let colour1 = readColour();
						let colour2;
						if(table_ceiling === 2){
							colour2 = +!colour1
						}
						else{
							colour2 = readColour()
						}
						let patch = create_dct(colour1,colour2,parseInt(instruction[3]),parseInt(instruction[4]),curr.size);
						for(let i=curr.x;(i<curr.x + curr.size) && i < width;i++){
							for(let j=curr.y;(j<curr.y + curr.size) && j < height;j++){
								currentEncode[i][j] = patch[i - curr.x][j - curr.y]
							}
						}
					}
				}
				if(curr.size === 2){
					previous2x2_curr.push(curr);
					while(previous2x2_curr.length > 3){
						previous2x2_curr.shift()
					}
					let instruction = readSmallSymbol();
					if(table_ceiling === 2){
						write2x2(curr,...rePlex(instruction,4))
						continue
					}
					/*if(instruction === "PREVIOUS"){
						let chunck_previous = get_chunck(previous2x2_curr[previous2x2_curr.length - 2].x,previous2x2_curr[previous2x2_curr.length - 2].y,2);
						write2x2(curr,chunck_previous[0][0],chunck_previous[1][0],chunck_previous[1][1],chunck_previous[0][1])
					}
					if(instruction === "PREVIOUS2"){
						let chunck_previous = get_chunck(previous2x2_curr[previous2x2_curr.length - 3].x,previous2x2_curr[previous2x2_curr.length - 3].y,2);
						write2x2(curr,chunck_previous[0][0],chunck_previous[1][0],chunck_previous[1][1],chunck_previous[0][1])
					}
					else */if(instruction === "pixels"){
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
		}
		catch(e){
			console.log(e);
			console.log("INTER");
			let translatedFallback = translationTable.findIndex(a => a === options.fallback);
			if(translatedFallback === -1){
				translatedFallback = Math.floor(translationTable.length/2)
			}
			blockQueue.forEach(curr => {
				for(let i=curr.x;i<(curr.x + curr.size) && i < width;i++){
					for(let j=curr.y;j<(curr.y + curr.size) && j < height;j++){
						currentEncode[i][j] = translatedFallback
					}
				}
			})
			throw "Incomplete data"
		}
		}
		catch(e){
			console.log(e);
			if(options.indexed || options.indexeda){
				let outBuffer = [];
				for(let j=0;j<height;j++){
					for(let i=0;i<width;i++){
						outBuffer.push(...c_index[currentEncode[i][j]])
					}
				}
				botchedFlag = true;
				return outBuffer
			}
			for(let i=0;i<width;i++){
				for(let j=0;j<height;j++){
					imageData[i][j] = translationTable[currentEncode[i][j]]
				}
			}
			botchedFlag = true;
			return imageData
		}
		if(options.indexed || options.indexeda){
			let outBuffer = [];
			for(let j=0;j<height;j++){
				for(let i=0;i<width;i++){
					outBuffer.push(...c_index[currentEncode[i][j]])
				}
			}
			return outBuffer
		}
		for(let i=0;i<width;i++){
			for(let j=0;j<height;j++){
				imageData[i][j] = translationTable[currentEncode[i][j]]
			}
		}
		return imageData
	}
	if(pixelFormat === "greyscale"){
		channels.push(decodeChannel({bitDepth: 8}));
		let rawData = multiplexChannels(channels);
		return {
			imageData: rgb_to_rgba(greyscale_to_rgb(rawData)),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "yiq26"){
		channels.push(decodeChannel({bitDepth: 8}));
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 9, fallback: 256}))
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 9, fallback: 256}))
		}
		let rawData = multiplexChannels(channels);
		return {
			imageData: rgb_to_rgba(yiq26_to_rgb(rawData)),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "yiq26a"){
		let channels = new Array(4);
		channels[3] = decodeChannel({bitDepth: 8});
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(0))
			}
			channels[0] = fill256
		}
		else{
			channels[0] = decodeChannel({bitDepth: 8})
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels[1] = fill256
		}
		else{
			channels[1] = decodeChannel({bitDepth: 9, fallback: 256})
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(256))
			}
			channels[2] = fill256
		}
		else{
			channels[2] = decodeChannel({bitDepth: 9, fallback: 256})
		}
		let rawData = multiplexChannels(channels);
		return {
			imageData: yiq26a_to_rgba(rawData),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "ycocg"){
		channels.push(decodeChannel({bitDepth: 8}));
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(128))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 8, fallback: 128}))
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(128))
			}
			channels.push(fill256)
		}
		else{
			channels.push(decodeChannel({bitDepth: 8, fallback: 128}))
		}
		let rawData = multiplexChannels(channels);
		return {
			imageData: rgb_to_rgba(ycocg_to_rgb(rawData)),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "ycocga"){
		let channels = new Array(4);
		channels[3] = decodeChannel({bitDepth: 8});
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(0))
			}
			channels[0] = fill256
		}
		else{
			channels[0] = decodeChannel({bitDepth: 8})
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(128))
			}
			channels[1] = fill256
		}
		else{
			channels[1] = decodeChannel({bitDepth: 8, fallback: 128})
		}
		if(botchedFlag){
			let fill256 = [];
			for(let i=0;i<width;i++){
				fill256.push(new Array(height).fill(128))
			}
			channels[2] = fill256
		}
		else{
			channels[2] = decodeChannel({bitDepth: 8, fallback: 128})
		}
		let rawData = multiplexChannels(channels);
		return {
			imageData: ycocga_to_rgba(rawData),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "bit"){
		let rawData = multiplexChannels([decodeChannel({bitDepth: 1})]);
		return {
			imageData: bit_to_rgba(rawData),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "indexed"){
		let rawData = decodeChannel({bitDepth: 8,indexed: true});
		return {
			imageData: rgb_to_rgba(rawData),
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "indexeda"){
		let rawData = decodeChannel({bitDepth: 8,indexeda: true});
		return {
			imageData: rawData,
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "verbatim"){
		let rawData = [];
		for(let i=0;i<width*height;i++){
			rawData.push(readByteNative(),readByteNative(),readByteNative(),255)
		}
		return {
			imageData: rawData,
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "verbatimgreyscale"){
		let rawData = [];
		for(let i=0;i<width*height;i++){
			let hue = readByteNative()
			rawData.push(hue,hue,hue,255)
		}
		return {
			imageData: rawData,
			width: width,
			height: height
		}
	}
	else if(pixelFormat === "verbatimbit"){
		let rawData = [];
		for(let i=0;i<width*height;i++){
			rawData.push(readBit())
		}
		return {
			imageData: bit_to_rgba(rawData),
			width: width,
			height: height
		}
	}
	else{
		console.log("unknown pixel format",pixelFormat);
		throw "only certain decoding modes supported so far"
	}
}






