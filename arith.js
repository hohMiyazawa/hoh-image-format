//arith adopted from https://github.com/upupming/arithmetic-coding
const NUM_OF_BITS = 31

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
