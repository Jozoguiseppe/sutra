// Shared request/response shapes for the HTTP API (section 9 of docs/ARCHITECTURE.md).
// Both route handlers and UI import from here. Errors are always `{ error: string }`.

export interface Ymd { year: number; month: number; day: number }

export interface MeResponse {
  player: { id: string; nickname: string; cityId: number; cityName: string; offsetPoints: number };
  today: string;          // YYYY-MM-DD (Zagreb)
  display: Ymd;           // displayDate(today, offsetPoints)
}
// POST /api/player {nickname, cityId} -> 201 MeResponse
// errors: 400 nickname_short | nickname_long | nickname_invalid | city_invalid ; 409 nickname_taken
// GET /api/me -> 200 MeResponse ; 401 no_player

export interface CitiesResponse { counties: { id: number; name: string; cities: { id: number; name: string }[] }[] }

export interface QuestionDTO {
  id: string; position: number; kind: 'number' | 'yesno'; category: string;
  text: string; textEn: string;
  min: number | null; max: number | null; step: number | null; unit: string | null;
}
export interface PredictionDTO { questionId: string; value: number; staked: boolean }

// GET /api/round/open (no auth needed; predictions empty without a player)
export interface OpenRoundResponse { targetDate: string; lockAt: string; questions: QuestionDTO[]; predictions: PredictionDTO[] }

// PUT /api/predictions {questionId, value, staked} -> 200 { predictions } = ALL my predictions for that round after the change
// errors: 401 no_player ; 400 invalid_value ; 404 question_not_found ; 409 locked
export interface SavePredictionRequest { questionId: string; value: number; staked: boolean }
export interface SavePredictionResponse { predictions: PredictionDTO[] }

// GET /api/round/pending -> today's locked round. targetDate null when there is no round for today.
export interface PendingRoundResponse {
  targetDate: string | null; settleAt: string | null; settled: boolean;
  questions: QuestionDTO[]; predictions: PredictionDTO[];
}

// GET /api/round/result?date=YYYY-MM-DD (default: latest settled round) ; 404 no_result
export interface ResultQuestion {
  id: string; position: number; kind: 'number' | 'yesno'; text: string; textEn: string; unit: string | null;
  void: boolean; actual: number | null;
  my: { value: number; staked: boolean; points: number } | null;       // null = not answered / no player
  crowd: { count: number; avg: number | null; yesPct: number | null }; // avg for number, yesPct (0-100) for yesno
  crowdBeatPct: number | null;   // number questions: % of answering players whose error was larger than the crowd average's error
  wildest: { nickname: string; value: number } | null;                 // number questions: largest error
}
export interface RoundResultResponse {
  targetDate: string;
  players: number;                 // players who submitted at least one prediction
  me: null | {
    played: boolean; missed: boolean; delta: number;
    offsetBefore: number; offsetAfter: number;
    displayBefore: Ymd; displayAfter: Ymd;   // both computed relative to targetDate
    beatPct: number | null;        // % of participating players with a strictly lower delta
  };
  questions: ResultQuestion[];
}

export interface CityBoardResponse { cities: { cityId: number; cityName: string; countyName: string; players: number; avgOffset: number; displayYear: number }[] }

// GET /api/leagues -> my leagues ; POST /api/leagues {name} -> LeagueRef ; POST /api/leagues/join {code} -> LeagueRef (404 league_not_found)
export interface LeagueRef { code: string; name: string; members: number }
export interface MyLeaguesResponse { leagues: LeagueRef[] }
// GET /api/leagues/[code]
export interface LeagueTableResponse { code: string; name: string; table: { nickname: string; cityName: string; offsetPoints: number; displayYear: number; isMe: boolean }[] }

// GET /api/admin/questions?date= (default: the next round that is not yet open, i.e. today+2) ; header x-admin-token ; 401 bad_token
export interface AdminQuestionsResponse { targetDate: string; questions: (QuestionDTO & { status: 'proposed' | 'approved' | 'rejected' | 'void'; scale: number | null; sourceKey: string })[] }
// POST /api/admin/questions { action: 'approveAll', date } | { action: 'reject', questionId } | { action: 'generate', date } -> AdminQuestionsResponse
