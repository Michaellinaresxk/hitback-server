function bearerToken(req) {
  const authorization = req.get('Authorization') || '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

function createSessionCapabilityMiddleware(gameService, { tokenSelectSession = false } = {}) {
  return (req, res, next) => {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'Session capability required' });
    }

    const sessionId =
      req.params.id || req.body?.sessionId || req.query.sessionId || null;
    const session = sessionId
      ? gameService.sessions.get(sessionId)
      : tokenSelectSession
        ? Array.from(gameService.sessions.values()).find(
            (candidate) => gameService.verifyCapability(candidate.id, token),
          )
        : null;

    if (!session || !gameService.verifyCapability(session.id, token)) {
      return res.status(401).json({ success: false, error: 'Invalid session capability' });
    }

    req.authorizedSession = session;
    req.authorizedSessionId = session.id;

    const playerId = req.params.playerId || req.body?.playerId;
    if (playerId && !session.players.some((player) => player.id === playerId)) {
      return res.status(403).json({ success: false, error: 'Player does not belong to session' });
    }

    return next();
  };
}

module.exports = { createSessionCapabilityMiddleware };
