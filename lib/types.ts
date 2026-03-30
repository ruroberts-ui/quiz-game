export type GameStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINAL_QUESTION' | 'COMPLETE'

export interface Game {
  id: string
  status: GameStatus
  current_question_index: number
  question_started_at: string | null
  winner_player_id: string | null
  created_at: string
}

export interface Question {
  id: string
  game_id: string
  question_index: number
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
}

// Version sent to player phones — correct_answer is stripped server-side
export type QuestionForPlayer = Omit<Question, 'correct_answer'>

export interface Player {
  id: string
  game_id: string
  name: string
  is_eliminated: boolean
  joined_at: string
}

export interface Answer {
  id: string
  player_id: string
  question_id: string
  answer_given: string
  is_correct: boolean
  answered_at: string
}

// Shape returned by the PDF parser before saving to DB
export interface ParsedQuestion {
  question_index: number
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
}
