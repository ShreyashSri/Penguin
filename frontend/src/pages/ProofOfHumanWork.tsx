import { useState, useRef } from 'react'
import Topbar from '../components/Topbar'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { CheckCircle2, XCircle, User, Bot, Trophy, RotateCcw } from 'lucide-react'

type GameStage = 'start' | 'playing' | 'complete'
type ImageType = 'ai' | 'human'
type RoundResult = {
  round: number
  correct: boolean
  userChoice: ImageType
  actualType: ImageType
}

// Game pattern: AI, Human, Human, AI
const GAME_PATTERN: ImageType[] = ['ai', 'human', 'human', 'ai']

export default function ProofOfHumanWork() {
  const [gameStage, setGameStage] = useState<GameStage>('start')
  const [currentRound, setCurrentRound] = useState(0)
  const [roundResults, setRoundResults] = useState<RoundResult[]>([])
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [userChoice, setUserChoice] = useState<ImageType | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [score, setScore] = useState(0)
  const [images, setImages] = useState<{ url: string; type: ImageType }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imagesRef = useRef<{ url: string; type: ImageType }[]>([])

  // Load images from uploaded files or use placeholder
  const handleImageUpload = (files: FileList) => {
    const fileArray = Array.from(files).filter(file => file.type.startsWith('image/'))
    
    // We need at least 4 images
    if (fileArray.length < 4) {
      alert('Please upload at least 4 images to play the game')
      return
    }

    const imagePromises = fileArray.slice(0, 4).map((file, index) => {
      return new Promise<{ url: string; type: ImageType }>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          resolve({
            url: reader.result as string,
            type: GAME_PATTERN[index] as ImageType
          })
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(imagePromises).then((loadedImages) => {
      imagesRef.current = loadedImages
      setImages(loadedImages)
      startGame(loadedImages)
    })
  }

  const startGame = (gameImages: { url: string; type: ImageType }[]) => {
    imagesRef.current = gameImages
    setImages(gameImages)
    setGameStage('playing')
    setCurrentRound(0)
    setRoundResults([])
    setScore(0)
    loadRound(0, gameImages)
  }

  const loadRound = (round: number, gameImages: { url: string; type: ImageType }[]) => {
    if (round >= GAME_PATTERN.length) {
      setGameStage('complete')
      return
    }
    
    setCurrentRound(round)
    setCurrentImage(gameImages[round].url)
    setUserChoice(null)
    setShowResult(false)
  }

  const handleUserChoice = (choice: ImageType) => {
    if (userChoice !== null) return // Already answered
    
    const round = currentRound
    const actualType = GAME_PATTERN[round]
    const correct = choice === actualType
    
    setUserChoice(choice)
    setShowResult(true)
    
    if (correct) {
      setScore(prev => prev + 1)
    }
    
    const result: RoundResult = {
      round: round + 1,
      correct,
      userChoice: choice,
      actualType
    }
    
    setRoundResults(prev => [...prev, result])
    
    // Move to next round after 2 seconds
    setTimeout(() => {
      const nextRound = round + 1
      if (nextRound < GAME_PATTERN.length) {
        loadRound(nextRound, imagesRef.current)
      } else {
        setGameStage('complete')
      }
    }, 2000)
  }

  const handleReset = () => {
    setGameStage('start')
    setCurrentRound(0)
    setRoundResults([])
    setCurrentImage(null)
    setUserChoice(null)
    setShowResult(false)
    setScore(0)
    setImages([])
    imagesRef.current = []
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleImageUpload(files)
    }
  }

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <Topbar />
      <div className="max-w-7xl mx-auto px-4 py-10">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-fuchsia-500 to-cyan-500 bg-clip-text text-transparent text-center">
          Proof of Human Work
        </h1>
        <p className="text-center text-gray-400 mb-8">
          Test your ability to distinguish AI-generated content from human-created work
        </p>

        {/* Game Progress Indicator */}
        {gameStage === 'playing' && (
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-2">
              {GAME_PATTERN.map((type, index) => (
                <div key={index} className="flex items-center">
                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all ${
                    index < currentRound
                      ? 'border-green-500 bg-green-500/20'
                      : index === currentRound
                      ? 'border-cyan-500 bg-cyan-500/20 scale-110'
                      : 'border-gray-600 bg-gray-800/50'
                  }`}>
                    {index < currentRound ? (
                      roundResults[index]?.correct ? (
                        <CheckCircle2 className="w-6 h-6 text-green-400" />
                      ) : (
                        <XCircle className="w-6 h-6 text-red-400" />
                      )
                    ) : (
                      <span className="text-sm font-semibold">{index + 1}</span>
                    )}
                  </div>
                  {index < GAME_PATTERN.length - 1 && (
                    <div className={`w-8 h-0.5 ${
                      index < currentRound ? 'bg-green-500' : 'bg-gray-600'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score Display */}
        {gameStage === 'playing' && (
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 rounded-lg">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <span className="text-lg font-semibold">
                Score: <span className="text-cyan-400">{score}</span> / {currentRound + 1}
              </span>
            </div>
          </div>
        )}

        {/* Start Screen */}
        {gameStage === 'start' && (
          <Card>
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center gap-3 mb-6">
                  <Bot className="h-12 w-12 text-fuchsia-500" />
                  <User className="h-12 w-12 text-cyan-500" />
                </div>
                <h2 className="text-2xl font-semibold mb-4">Ready to Play?</h2>
                <p className="text-gray-400 mb-2">
                  Upload 4 images to start the game.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  You'll need to identify whether each image is AI-generated or human-created. Can you tell the difference?
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-gradient-to-r from-fuchsia-500 to-cyan-500 hover:from-fuchsia-600 hover:to-cyan-600 text-lg px-8 py-6"
                >
                  Upload 4 Images to Start
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Playing Stage */}
        {gameStage === 'playing' && currentImage && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">
                      Round {currentRound + 1} of {GAME_PATTERN.length}
                    </h2>
                  </div>
                  <div className="relative rounded-lg overflow-hidden border border-neutral-800">
                    <img
                      src={currentImage}
                      alt="Identify this image"
                      className="w-full h-auto max-h-[500px] object-contain bg-neutral-900"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold mb-4">Identify This Image</h2>
                  <p className="text-gray-400 mb-6">
                    Is this image AI-generated or human-created? Select your answer.
                  </p>
                  
                  {!showResult ? (
                    <div className="space-y-3">
                      <Button
                        onClick={() => handleUserChoice('ai')}
                        className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 h-16 text-lg flex items-center justify-center gap-3"
                        disabled={userChoice !== null}
                      >
                        <Bot className="h-5 w-5" />
                        AI Generated
                      </Button>
                      <Button
                        onClick={() => handleUserChoice('human')}
                        className="w-full bg-cyan-600 hover:bg-cyan-700 h-16 text-lg flex items-center justify-center gap-3"
                        disabled={userChoice !== null}
                      >
                        <User className="h-5 w-5" />
                        Human Generated
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      {roundResults[currentRound]?.correct ? (
                        <>
                          <CheckCircle2 className="mx-auto h-16 w-16 text-green-400 mb-4" />
                          <p className="text-xl font-semibold text-green-400 mb-2">Correct!</p>
                          <p className="text-gray-400">
                            This is a {GAME_PATTERN[currentRound] === 'ai' ? 'AI-generated' : 'human-created'} image.
                          </p>
                        </>
                      ) : (
                        <>
                          <XCircle className="mx-auto h-16 w-16 text-red-400 mb-4" />
                          <p className="text-xl font-semibold text-red-400 mb-2">Incorrect</p>
                          <p className="text-gray-400">
                            This is actually a {GAME_PATTERN[currentRound] === 'ai' ? 'AI-generated' : 'human-created'} image.
                          </p>
                        </>
                      )}
                      <p className="text-sm text-gray-500 mt-4">
                        {currentRound < GAME_PATTERN.length - 1 ? 'Moving to next round...' : 'Game complete!'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Complete Stage */}
        {gameStage === 'complete' && (
          <Card>
            <CardContent className="p-6">
              <div className="text-center py-12">
                <Trophy className="mx-auto h-20 w-20 text-yellow-400 mb-6" />
                <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-fuchsia-500 to-cyan-500 bg-clip-text text-transparent">
                  Game Complete!
                </h2>
                <div className="mb-8">
                  <p className="text-4xl font-bold text-cyan-400 mb-2">
                    {score} / {GAME_PATTERN.length}
                  </p>
                  <p className="text-gray-400 text-lg">
                    {score === GAME_PATTERN.length 
                      ? 'Perfect score! You\'re a master at identifying AI vs Human content!' 
                      : score >= GAME_PATTERN.length / 2
                      ? 'Good job! You have a good eye for detail.'
                      : 'Keep practicing! You\'ll get better with time.'}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-8">
                  {roundResults.map((result, index) => (
                    <div
                      key={index}
                      className={`rounded-lg p-4 border ${
                        result.correct
                          ? 'bg-green-500/10 border-green-500/20'
                          : 'bg-red-500/10 border-red-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-center mb-2">
                        {result.correct ? (
                          <CheckCircle2 className="h-6 w-6 text-green-400" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-400" />
                        )}
                      </div>
                      <p className="text-sm font-semibold mb-1">Round {result.round}</p>
                      <p className="text-xs text-gray-400">
                        You: {result.userChoice === 'ai' ? 'AI' : 'Human'}
                      </p>
                      <p className="text-xs text-gray-400">
                        Actual: {result.actualType === 'ai' ? 'AI' : 'Human'}
                      </p>
                    </div>
                  ))}
                </div>
                
                <Button
                  onClick={handleReset}
                  className="bg-gradient-to-r from-fuchsia-500 to-cyan-500 hover:from-fuchsia-600 hover:to-cyan-600 text-lg px-8 py-6"
                >
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Play Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}

