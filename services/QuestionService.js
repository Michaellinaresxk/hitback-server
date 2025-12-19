/**
 * ❓ Question Service - Genera preguntas dinámicamente
 * 
 * ✅ Preguntas AUTO-GENERADAS desde datos del track:
 *    - song: ¿Cuál es la canción? → track.title
 *    - artist: ¿Quién canta? → track.artist
 *    - decade: ¿De qué década? → track.decade
 *    - year: ¿En qué año? → track.year
 * 
 * ✅ Preguntas que REQUIEREN datos guardados:
 *    - lyrics: track.lyrics.fragment + track.lyrics.answer
 *    - challenge: track.challenge.text + track.challenge.type
 */

class QuestionService {
  constructor() {
    // Tipos de pregunta disponibles
    this.QUESTION_TYPES = ['song', 'artist', 'decade', 'year', 'lyrics', 'challenge'];

    // Tipos que siempre están disponibles (se generan de datos básicos)
    this.AUTO_TYPES = ['song', 'artist', 'decade', 'year'];

    // Tipos que requieren datos extra en el track
    this.STORED_TYPES = ['lyrics', 'challenge'];

    // Puntos base por tipo
    this.BASE_POINTS = {
      song: 1,
      artist: 2,
      decade: 2,
      year: 3,
      lyrics: 3,
      challenge: 5
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎯 MÉTODO PRINCIPAL: Generar pregunta para un track
  // ═══════════════════════════════════════════════════════════

  /**
   * Genera una pregunta para el track dado
   * @param {Object} track - Track con datos básicos
   * @param {string} questionType - Tipo de pregunta (opcional, si no se pasa es aleatorio)
   * @returns {Object} Pregunta generada
   */
  generateQuestion(track, questionType = null) {
    if (!track) {
      throw new Error('Track es requerido para generar pregunta');
    }

    // Si no se especifica tipo, elegir aleatorio
    const type = questionType || this.getRandomQuestionType(track);

    console.log(`❓ Generando pregunta tipo "${type}" para: ${track.title}`);

    // Generar según tipo
    switch (type) {
      case 'song':
        return this._generateSongQuestion(track);

      case 'artist':
        return this._generateArtistQuestion(track);

      case 'decade':
        return this._generateDecadeQuestion(track);

      case 'year':
        return this._generateYearQuestion(track);

      case 'lyrics':
        return this._generateLyricsQuestion(track);

      case 'challenge':
        return this._generateChallengeQuestion(track);

      default:
        console.warn(`⚠️ Tipo desconocido "${type}", usando "song"`);
        return this._generateSongQuestion(track);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🎲 SELECCIÓN ALEATORIA DE TIPO
  // ═══════════════════════════════════════════════════════════

  /**
   * Obtiene tipos de pregunta disponibles para un track
   */
  getAvailableTypes(track) {
    // Tipos automáticos siempre disponibles
    const available = [...this.AUTO_TYPES];

    // Agregar lyrics si el track tiene datos
    if (track.lyrics && track.lyrics.fragment && track.lyrics.answer) {
      available.push('lyrics');
    }

    // Agregar challenge si el track tiene datos
    if (track.challenge && track.challenge.text) {
      available.push('challenge');
    }

    return available;
  }

  /**
   * Selecciona tipo de pregunta aleatorio (ponderado)
   */
  getRandomQuestionType(track) {
    const available = this.getAvailableTypes(track);

    // Ponderación: más probabilidad para tipos comunes
    const weights = {
      song: 25,
      artist: 30,
      decade: 20,
      year: 10,
      lyrics: 10,
      challenge: 5
    };

    // Crear pool ponderado
    const weightedPool = [];
    available.forEach(type => {
      const weight = weights[type] || 10;
      for (let i = 0; i < weight; i++) {
        weightedPool.push(type);
      }
    });

    // Seleccionar aleatorio
    const randomIndex = Math.floor(Math.random() * weightedPool.length);
    return weightedPool[randomIndex];
  }

  // ═══════════════════════════════════════════════════════════
  // 🎵 GENERADORES DE PREGUNTAS AUTO
  // ═══════════════════════════════════════════════════════════

  _generateSongQuestion(track) {
    return {
      type: 'song',
      question: '¿Cuál es el nombre de esta canción?',
      answer: track.title,
      acceptableAnswers: this._generateAcceptableAnswers(track.title),
      hints: this._generateSongHints(track),
      points: this.BASE_POINTS.song,
      icon: '🎵'
    };
  }

  _generateArtistQuestion(track) {
    return {
      type: 'artist',
      question: '¿Quién canta esta canción?',
      answer: track.artist,
      acceptableAnswers: this._generateAcceptableAnswers(track.artist),
      hints: this._generateArtistHints(track),
      points: this.BASE_POINTS.artist,
      icon: '🎤'
    };
  }

  _generateDecadeQuestion(track) {
    return {
      type: 'decade',
      question: '¿De qué década es esta canción?',
      answer: track.decade,
      acceptableAnswers: this._generateDecadeAcceptable(track.decade),
      hints: this._generateDecadeHints(track),
      points: this.BASE_POINTS.decade,
      icon: '📅'
    };
  }

  _generateYearQuestion(track) {
    return {
      type: 'year',
      question: '¿En qué año salió esta canción?',
      answer: track.year.toString(),
      acceptableAnswers: [track.year.toString()],
      hints: this._generateYearHints(track),
      points: this.BASE_POINTS.year,
      icon: '📆'
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 📝 GENERADORES DE PREGUNTAS STORED (requieren datos extra)
  // ═══════════════════════════════════════════════════════════

  _generateLyricsQuestion(track) {
    // Fallback si no hay datos de lyrics
    if (!track.lyrics || !track.lyrics.fragment) {
      console.warn(`⚠️ Track ${track.id} no tiene lyrics, usando pregunta de artista`);
      return this._generateArtistQuestion(track);
    }

    return {
      type: 'lyrics',
      question: `Completa la letra: "${track.lyrics.fragment}..."`,
      answer: track.lyrics.answer,
      acceptableAnswers: this._generateAcceptableAnswers(track.lyrics.answer),
      hints: ['Escucha atentamente la letra'],
      points: this.BASE_POINTS.lyrics,
      icon: '📝'
    };
  }

  _generateChallengeQuestion(track) {
    // Fallback si no hay datos de challenge
    if (!track.challenge || !track.challenge.text) {
      console.warn(`⚠️ Track ${track.id} no tiene challenge, usando pregunta de canción`);
      return this._generateSongQuestion(track);
    }

    return {
      type: 'challenge',
      question: track.challenge.text,
      answer: 'Completar reto',
      acceptableAnswers: ['completado', 'hecho', 'done'],
      hints: ['¡Demuestra tu talento!'],
      points: this.BASE_POINTS.challenge,
      challengeType: track.challenge.type || 'perform',
      icon: '🔥',
      isChallenge: true
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🔧 UTILIDADES
  // ═══════════════════════════════════════════════════════════

  /**
   * Genera variaciones aceptables de una respuesta
   */
  _generateAcceptableAnswers(answer) {
    if (!answer) return [];

    const variations = new Set();
    const normalized = answer.toLowerCase().trim();

    // Original normalizado
    variations.add(normalized);

    // Sin acentos
    const noAccents = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    variations.add(noAccents);

    // Separar colaboraciones: "Luis Fonsi ft. Daddy Yankee"
    if (normalized.includes(' ft.') || normalized.includes(' feat.') || normalized.includes(' ft ')) {
      const mainArtist = normalized.split(/\s*(ft\.?|feat\.?|featuring|&|y|and|with)\s*/i)[0].trim();
      variations.add(mainArtist);
    }

    // Quitar "The" al inicio: "The Beatles" → "Beatles"
    if (normalized.startsWith('the ')) {
      variations.add(normalized.substring(4));
    }

    // Quitar paréntesis: "Despacito (Remix)" → "Despacito"
    const noParens = normalized.replace(/\s*\([^)]*\)/g, '').trim();
    if (noParens !== normalized) {
      variations.add(noParens);
    }

    return Array.from(variations);
  }

  /**
   * Genera variaciones para décadas
   */
  _generateDecadeAcceptable(decade) {
    if (!decade) return [];

    const variations = [
      decade.toLowerCase(),
      decade.replace('s', ''),
      decade.replace('19', '').replace('20', ''),
    ];

    // "1980s" → ["1980s", "1980", "80s", "80", "ochenta", "eighties"]
    const year = decade.replace('s', '');
    const shortYear = year.slice(-2);

    variations.push(shortYear + 's');
    variations.push(shortYear);

    return variations;
  }

  /**
   * Genera hints para preguntas de canción
   */
  _generateSongHints(track) {
    const hints = [];

    if (track.artist) {
      hints.push(`Artista: ${track.artist.split(' ')[0]}...`);
    }
    if (track.album) {
      hints.push(`Del álbum: ${track.album}`);
    }
    if (track.genre) {
      hints.push(`Género: ${track.genre}`);
    }

    return hints.length > 0 ? hints : ['Escucha con atención'];
  }

  /**
   * Genera hints para preguntas de artista
   */
  _generateArtistHints(track) {
    const hints = [];

    if (track.decade) {
      hints.push(`Época: ${track.decade}`);
    }
    if (track.genre) {
      hints.push(`Género: ${track.genre}`);
    }
    if (track.title) {
      hints.push(`Canción: ${track.title.substring(0, 3)}...`);
    }

    return hints.length > 0 ? hints : ['Reconoce la voz'];
  }

  /**
   * Genera hints para preguntas de década
   */
  _generateDecadeHints(track) {
    const hints = [];

    if (track.year) {
      const nearDecade = Math.floor(track.year / 10) * 10;
      hints.push(`Cerca de ${nearDecade}`);
    }
    if (track.genre) {
      hints.push(`Estilo: ${track.genre}`);
    }

    return hints.length > 0 ? hints : ['Piensa en el estilo musical'];
  }

  /**
   * Genera hints para preguntas de año
   */
  _generateYearHints(track) {
    const hints = [];

    if (track.decade) {
      hints.push(`Década: ${track.decade}`);
    }
    if (track.year) {
      const range = `${track.year - 2} - ${track.year + 2}`;
      hints.push(`Entre ${range}`);
    }

    return hints.length > 0 ? hints : ['Piensa en la época'];
  }

  // ═══════════════════════════════════════════════════════════
  // ✅ VALIDACIÓN DE RESPUESTAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Valida si una respuesta es correcta
   * @param {string} userAnswer - Respuesta del usuario
   * @param {Object} question - Pregunta generada
   * @returns {Object} { correct: boolean, exactMatch: boolean }
   */
  validateAnswer(userAnswer, question) {
    if (!userAnswer || !question) {
      return { correct: false, exactMatch: false };
    }

    const normalized = userAnswer.toLowerCase().trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Verificar match exacto
    const exactMatch = normalized === question.answer.toLowerCase().trim();

    // Verificar contra respuestas aceptables
    const acceptable = question.acceptableAnswers || [];
    const isAcceptable = acceptable.some(ans => {
      const normalizedAns = ans.toLowerCase().trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return normalized === normalizedAns ||
        normalized.includes(normalizedAns) ||
        normalizedAns.includes(normalized);
    });

    return {
      correct: exactMatch || isAcceptable,
      exactMatch,
      userAnswer: normalized,
      correctAnswer: question.answer
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 📊 ESTADÍSTICAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Obtiene info del servicio
   */
  getServiceInfo() {
    return {
      questionTypes: this.QUESTION_TYPES,
      autoGeneratedTypes: this.AUTO_TYPES,
      storedTypes: this.STORED_TYPES,
      basePoints: this.BASE_POINTS
    };
  }
}

module.exports = QuestionService;