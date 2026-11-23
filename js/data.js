'use strict';
/* Sample projects, written in Fountain so they exercise the real importer. */
const SAMPLE_SCREENPLAY = `Title: THE LAST REEL
Credit: Written by
Author: Alex Rivera
Draft date: First draft

FADE IN:

INT. RIVERSIDE CINEMA - LOBBY - NIGHT

Dust hangs in the amber glow of a dying marquee. The popcorn machine sits dark. MARGOT KELLER (60s, cardigan, keys on a lanyard) mops the same square of floor she has mopped for forty years.

The front doors RATTLE. THEO (20s, soaked, camera bag clutched to his chest) pushes inside.

THEO
We're closed?

MARGOT
Forty years, you'd think the sign would've convinced someone by now.

THEO
(shaking off rain)
I'm looking for a film. A print. It's supposed to be here.

Margot stops mopping. She studies him, then the camera bag.

MARGOT
Nobody asks for that one.

INT. RIVERSIDE CINEMA - PROJECTION BOOTH - NIGHT

A cramped, hot room full of old machinery. A vintage 35mm projector squats in the middle like a sleeping animal. Margot unlocks a steel cabinet. Inside, a single FILM CAN labeled "REEL 7 - DO NOT SCREEN."

THEO
Why not?

MARGOT
Because of what's on it.

She sets the can on the projector. Her hands shake, just slightly.

MARGOT (CONT'D)
Your grandfather shot this. The night before he vanished.

Theo takes a step back. The projector's lamp FLICKERS on by itself.

CUT TO:

EXT. RIVERSIDE CINEMA - ALLEY - NIGHT

Rain hammers the dumpsters. A black SEDAN idles at the mouth of the alley, headlights off. A MAN IN A GREY COAT (50s) watches the booth's lit window through the windshield. He lifts a phone to his ear.

MAN IN GREY COAT
(low)
They found it. Start the car.

He doesn't need to. The engine is already running.

INT. RIVERSIDE CINEMA - AUDITORIUM - NIGHT

Four hundred empty seats. A white screen. The projector's beam cuts through the dark and a grainy image blooms: a younger Margot, laughing, on a rooftop with a MAN who looks exactly like Theo.

THEO
That's... that's me.

MARGOT
That's your grandfather. Hold on to your seat.

On screen, the laughing man turns to the camera and speaks directly to them.

FILM GRANDFATHER (V.O.)
If you're watching this, they've finally stopped looking for me.

Theo and Margot exchange a look. Behind them, the auditorium doors SWING OPEN.

SMASH CUT TO:

EXT. RIVERSIDE CINEMA - ROOFTOP - DAWN

Pale light over the river. Theo and Margot crouch behind an air vent, the film can between them. Below, the grey SEDAN rolls to a stop.

MARGOT
There's one more thing you should know.

THEO
There's always one more thing.

MARGOT
The film isn't finished. Your grandfather never shot the ending.

She hands him the camera.

MARGOT (CONT'D)
That's your job.

FADE OUT.
`;

const SAMPLE_STAGE = `Title: THE WAITING ROOM
Credit: A play in two scenes by
Author: Jordan Ellis
Draft date: Workshop draft

# ACT ONE

## SCENE 1 - A DOCTOR'S WAITING ROOM, LATE AFTERNOON

!A shabby waiting room. Four mismatched chairs, a coffee table stacked with out-of-date magazines. A door UPSTAGE LEFT leads to the doctor's office; a door DOWNSTAGE RIGHT leads to the street. A clock on the wall has stopped at 4:10.

!(LIGHTS UP slowly. DOROTHY, seventies, sits very upright, her handbag in her lap. FRANK, forties, paces.)

DOROTHY
You'll wear a hole in that carpet.

FRANK
(not stopping)
Somebody should.

DOROTHY
Sit. They'll call you when they call you.

FRANK
It's been two hours.

DOROTHY
It's been four years, if you count the way you count.

!(FRANK stops. He looks at the clock.)

FRANK
That clock has been wrong the whole time I've been here.

DOROTHY
It's not wrong. It's patient.

!(A telephone RINGS offstage. Neither moves.)

> LX 12 - Fade to cold half-light, isolating the two chairs.

## SCENE 2 - THE SAME, LATER

!(The light has changed to evening gold. The coffee table has been moved. MAYA, twenties, enters from the street door, shaking out an umbrella.)

MAYA
Is this where you wait for the doctor?

FRANK
It's where you wait.

MAYA
(sitting)
That's not what I asked.

!(DOROTHY smiles for the first time.)

DOROTHY
She'll fit in.

!(BLACKOUT.)

> LX 13 - BLACKOUT.
`;

const SAMPLE_PODCAST = `Title: THE MIDNIGHT FREQUENCY
Credit: A narrative podcast created by
Author: Elena Rostova
Draft date: Recording draft

SEGMENT 1 - COLD OPEN: THE ANOMALY

SFX: Heavy wind against a corrugated metal wall. Rapid clicks of an old shortwave radio tuner dial drifting through dead air and static.

MUSIC: Deep ambient synth drone enters, slow and ominous.

ELENA
(intimate, close to mic)
At 3:17 in the morning on November 4th, an automated listening post in northern Norway recorded a signal that wasn't supposed to exist.

SFX: Sudden burst of five repeating tones — clean, synthetic, bell-like.

CLIP: Norwegian Arctic Observatory automated log beep (0:04).

ELENA
It didn't come from a satellite. It didn't bounce off the ionosphere. It originated twenty feet beneath the ice.

MUSIC: Synth swells with a low sub-bass pulse, then drops to a quiet murmur.

SPONSOR: GroundWire Audio — "This episode is supported by GroundWire, makers of pristine field recorders. Use code FREQUENCY for 20% off at groundwire.example."

SEGMENT 2 - THE ARCHIVE CALL

SFX: Studio intercom chime. Remote line connecting tone with slight digital delay.

ELENA
Dr. Vance, are you there?

DR. VANCE
(over phone filter, distant room tone)
I can hear you, Elena. But if you're calling about the Svalbard tape, I told your producers I can't speak on the record.

ELENA
(pressing gently)
We verified the coordinates, Dr. Vance. The old submarine trench. You were the chief acoustic analyst stationed there in '98.

DR. VANCE
Then you know why you should delete that audio.

SFX: Sharp line disconnect tone — double beeps, then hum of dial tone.

MUSIC: Tension sting fades into quiet atmospheric rain.
`;
