import OpenAI from "openai";

import { NextResponse } from "next/server";



export const runtime = "nodejs";

export const maxDuration = 120;



const openai = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY,

});



const episodeSchema = {

  type: "object",

  additionalProperties: false,

  properties: {

    title: {

      type: "string",

    },

    hook: {

      type: "string",

    },

    episode_summary: {

      type: "string",

    },

    script: {

      type: "string",

    },

    cliffhanger: {

      type: "string",

    },

    continuity_notes: {

      type: "array",

      items: {

        type: "string",

      },

    },

    scenes: {

      type: "array",

      items: {

        type: "object",

        additionalProperties: false,

        properties: {

          scene_number: {

            type: "integer",

          },

          duration_seconds: {

            type: "integer",

          },

          narration: {

            type: "string",

          },

          dialogue: {

            type: "string",

          },

          caption: {

            type: "string",

          },

          visual_prompt: {

            type: "string",

          },

          camera_direction: {

            type: "string",

          },

          sound_direction: {

            type: "string",

          },

        },

        required: [

          "scene_number",

          "duration_seconds",

          "narration",

          "dialogue",

          "caption",

          "visual_prompt",

          "camera_direction",

          "sound_direction",

        ],

      },

    },

  },

  required: [

    "title",

    "hook",

    "episode_summary",

    "script",

    "cliffhanger",

    "continuity_notes",

    "scenes",

  ],

};



function cleanText(value, fallback = "") {

  if (typeof value === "string") {

    return value.trim();

  }



  if (value === null || value === undefined) {

    return fallback;

  }



  if (Array.isArray(value)) {

    return value

      .map((item) => cleanText(item))

      .filter(Boolean)

      .join(" ");

  }



  if (typeof value === "object") {

    return Object.entries(value)

      .map(([key, item]) => {

        const text = cleanText(item);

        return text ? `${key}: ${text}` : "";

      })

      .filter(Boolean)

      .join(" ");

  }



  return String(value).trim();

}



function normaliseDuration(value) {

  const duration = Number(value);



  if ([30, 60, 90].includes(duration)) {

    return duration;

  }



  return 60;

}



function normaliseEpisodeNumber(value) {

  const episodeNumber = Number(value);



  if (

    Number.isInteger(episodeNumber) &&

    episodeNumber > 0

  ) {

    return episodeNumber;

  }



  return 1;

}



function normaliseContinuity(continuity) {

  if (!Array.isArray(continuity)) {

    return [];

  }



  return continuity

    .map((episode) => ({

      episode_number:

        Number(episode?.episode_number) || 0,

      title: cleanText(episode?.title),

      summary: cleanText(episode?.summary),

      cliffhanger: cleanText(

        episode?.cliffhanger,

      ),

      source: cleanText(

        episode?.source,

        "dramaai",

      ),

      status: cleanText(

        episode?.status,

      ),

    }))

    .filter(

      (episode) =>

        episode.episode_number > 0,

    )

    .sort(

      (a, b) =>

        a.episode_number -

        b.episode_number,

    );

}



function buildContinuityText(continuity) {

  if (!continuity.length) {

    return "No earlier episode continuity was supplied.";

  }



  return continuity

    .map((episode) => {

      return [

        `Episode ${episode.episode_number}`,

        `Title: ${episode.title || "Untitled"}`,

        `Summary: ${

          episode.summary ||

          "No summary supplied."

        }`,

        `Cliffhanger: ${

          episode.cliffhanger ||

          "No cliffhanger supplied."

        }`,

        `Source: ${

          episode.source ||

          "dramaai"

        }`,

      ].join("\n");

    })

    .join("\n\n");

}



function buildPreviousEpisodeText(

  previousEpisode,

) {

  if (!previousEpisode) {

    return "No immediately previous episode was supplied.";

  }



  const storyboard =

    previousEpisode.storyboard &&

    typeof previousEpisode.storyboard ===

      "object"

      ? previousEpisode.storyboard

      : {};



  const continuityNotes =

    Array.isArray(

      storyboard.continuity_notes,

    )

      ? storyboard.continuity_notes

          .map((item) =>

            cleanText(item),

          )

          .filter(Boolean)

      : [];



  return [

    `Episode number: ${

      previousEpisode.episode_number ||

      ""

    }`,

    `Title: ${

      cleanText(

        previousEpisode.title,

      ) || "Untitled"

    }`,

    `Summary: ${

      cleanText(

        previousEpisode.episode_summary,

      ) || "Not supplied"

    }`,

    `Cliffhanger: ${

      cleanText(

        previousEpisode.cliffhanger,

      ) || "Not supplied"

    }`,

    `Full script: ${

      cleanText(

        previousEpisode.script,

      ) || "Not supplied"

    }`,

    `Continuity notes: ${

      continuityNotes.length

        ? continuityNotes.join(" | ")

        : "None supplied"

    }`,

  ].join("\n");

}



function getSceneGuidance(duration) {

  if (duration === 30) {

    return `

Create approximately 5 to 7 scenes.

Use mostly 4 to 7 second scenes.

Keep the episode extremely focused.

`;

  }



  if (duration === 90) {

    return `

Create approximately 11 to 15 scenes.

Use mostly 5 to 9 second scenes.

Allow slightly more character development while maintaining short-form pacing.

`;

  }



  return `

Create approximately 8 to 11 scenes.

Use mostly 5 to 8 second scenes.

Maintain fast short-form pacing throughout.

`;

}



function buildSystemPrompt() {

  return `

You are DramaAI Studio's episodic short-drama writing engine.



You create original vertical short-form drama episodes for TikTok, Instagram Reels and YouTube Shorts.



The most important requirement is SERIES CONTINUITY.



Treat all supplied previous episode information as established canon.



Never casually change:

character identities,

relationships,

family connections,

important locations,

previously established events,

dates,

secrets,

injuries,

possessions,

unresolved mysteries,

or earlier cliffhangers.



The new episode must feel like the immediate next episode of the same series.



When the previous episode ends with a direct confrontation, revelation, discovery, message, arrival or question, continue from that moment unless the creator explicitly requests a time jump.



Do not repeat the previous episode as exposition.



Move the story forward.



Every episode should contain:

a strong opening hook,

immediate continuation of the central conflict,

escalating tension,

at least one meaningful development,

clear visual storytelling,

natural dialogue,

and a strong final cliffhanger.



The episode must be suitable for vertical mobile viewing.



Visual prompts must be production-ready.



For Economy/faceless production:

avoid requiring clearly identifiable faces unless necessary,

prefer silhouettes,

backs of characters,

over-the-shoulder compositions,

hands,

phones,

objects,

doorways,

reflections,

street views,

interiors,

environmental details,

and cinematic close-ups.



Maintain visual continuity between scenes.



Do not put production instructions inside dialogue.



Do not mention AI, prompts, cameras or generation systems inside the fictional story.



Dialogue must remain a plain string for backward compatibility.
Also return dialogue_lines as an ordered array of {speaker, text} objects.
Every spoken line must have the exact character name and spoken words only.
Use an empty dialogue_lines array for scenes without spoken dialogue.
Never place stage directions, narration, or character names inside the text field.
The dialogue string must accurately represent the same lines and order as dialogue_lines.
For conversational scenes prefer dialogue over narration, and do not narrate the characters' spoken words.
Avoid placing more dialogue into a scene than can be spoken within its duration.



Narration must be concise enough to fit naturally within each scene duration.



Captions must be short and readable on a mobile screen.



The sum of all scene duration_seconds values MUST equal the requested episode duration exactly.



Scene numbers must begin at 1 and increase sequentially.



Return only data matching the required JSON schema.

`;

}



function buildUserPrompt({

  seriesTitle,

  genre,

  platform,

  episodeNumber,

  duration,

  generationMode,

  creatorDirection,

  previousEpisode,

  continuity,

}) {

  const continuityText =

    buildContinuityText(continuity);



  const previousEpisodeText =

    buildPreviousEpisodeText(

      previousEpisode,

    );



  const direction =

    cleanText(creatorDirection) ||

    "Continue naturally from the previous episode and its cliffhanger.";



  return `

Create Episode ${episodeNumber} of the following continuing drama series.



SERIES

Title: ${seriesTitle}

Genre: ${genre}

Target platform: ${platform}

Episode duration: ${duration} seconds

Production mode: ${generationMode}



CREATOR DIRECTION

${direction}



FULL SERIES CONTINUITY

${continuityText}



IMMEDIATELY PREVIOUS EPISODE

${previousEpisodeText}



STORY REQUIREMENTS

Episode ${episodeNumber} must continue the established story rather than restarting it.



The opening should connect naturally to the previous cliffhanger.



Do not contradict earlier episodes.



Do not reveal every mystery immediately.



Advance at least one important plot thread.



Preserve unresolved secrets that should remain unresolved.



Introduce new information only when it strengthens the existing story.



Avoid unnecessary new characters.



If a new character is introduced, make their purpose clear.



Make dialogue believable and concise.



Use British English where appropriate to the series setting.



Keep names exactly consistent with the supplied continuity.



The title should contain only the episode's creative title.

Do not include the series title.

Do not include "Episode ${episodeNumber}" in the title.



The episode_summary should clearly record the important events that future episodes need to remember.



The cliffhanger should describe the exact unresolved moment at the end.



continuity_notes should record important facts that future episodes must preserve.



STORYBOARD

${getSceneGuidance(duration)}



The combined duration_seconds of every scene must equal exactly ${duration} seconds.



Every scene must include:

scene_number,

duration_seconds,

narration,

dialogue,

caption,

visual_prompt,

camera_direction,

sound_direction.



For scenes without dialogue, return an empty string and an empty dialogue_lines array.



For scenes without narration, return an empty string.



For production mode "${generationMode}", make the visuals achievable within that production level.



The final scene must deliver the cliffhanger.

`;

}



function normaliseScenes(

  scenes,

  targetDuration,

) {

  if (!Array.isArray(scenes)) {

    return [];

  }



  const cleanedScenes = scenes

    .map((scene, index) => ({

      scene_number: index + 1,

      duration_seconds: Math.max(

        1,

        Math.round(

          Number(

            scene?.duration_seconds,

          ) || 1,

        ),

      ),

      narration: cleanText(

        scene?.narration,

      ),

      dialogue: cleanText(

        scene?.dialogue,

      ),
        dialogue_lines: Array.isArray(scene?.dialogue_lines)
          ? scene.dialogue_lines
              .map((line) => ({
                speaker: cleanText(line?.speaker),
                text: cleanText(line?.text),
              }))
              .filter((line) => line.speaker && line.text)
          : [],

      caption: cleanText(

        scene?.caption,

      ),

      visual_prompt: cleanText(

        scene?.visual_prompt,

      ),

      camera_direction: cleanText(

        scene?.camera_direction,

      ),

      sound_direction: cleanText(

        scene?.sound_direction,

      ),

    }))

    .filter(

      (scene) =>

        scene.visual_prompt ||

        scene.narration ||

        scene.dialogue ||

        scene.caption,

    );



  if (!cleanedScenes.length) {

    return [];

  }



  const totalDuration =

    cleanedScenes.reduce(

      (total, scene) =>

        total +

        scene.duration_seconds,

      0,

    );



  const difference =

    targetDuration -

    totalDuration;



  if (difference === 0) {

    return cleanedScenes;

  }



  if (difference > 0) {

    cleanedScenes[

      cleanedScenes.length - 1

    ].duration_seconds += difference;



    return cleanedScenes;

  }



  let remainingReduction =

    Math.abs(difference);



  for (

    let index =

      cleanedScenes.length - 1;

    index >= 0 &&

    remainingReduction > 0;

    index -= 1

  ) {

    const scene =

      cleanedScenes[index];



    const reducible = Math.max(

      0,

      scene.duration_seconds - 1,

    );



    const reduction = Math.min(

      reducible,

      remainingReduction,

    );



    scene.duration_seconds -=

      reduction;



    remainingReduction -=

      reduction;

  }



  if (remainingReduction > 0) {

    return [];

  }



  return cleanedScenes;

}



function normaliseEpisode(

  episode,

  duration,

) {

  const scenes = normaliseScenes(

    episode?.scenes,

    duration,

  );



  return {

    title: cleanText(

      episode?.title,

      "Untitled Episode",

    ),

    hook: cleanText(

      episode?.hook,

    ),

    episode_summary: cleanText(

      episode?.episode_summary,

    ),

    script: cleanText(

      episode?.script,

    ),

    cliffhanger: cleanText(

      episode?.cliffhanger,

    ),

    continuity_notes: Array.isArray(

      episode?.continuity_notes,

    )

      ? episode.continuity_notes

          .map((item) =>

            cleanText(item),

          )

          .filter(Boolean)

      : [],

    scenes,

  };

}



function validateEpisode(

  episode,

  duration,

) {

  if (!episode.title) {

    throw new Error(

      "The generated episode does not have a title.",

    );

  }



  if (!episode.hook) {

    throw new Error(

      "The generated episode does not have an opening hook.",

    );

  }



  if (!episode.episode_summary) {

    throw new Error(

      "The generated episode does not have a summary.",

    );

  }



  if (!episode.script) {

    throw new Error(

      "The generated episode does not have a script.",

    );

  }



  if (!episode.cliffhanger) {

    throw new Error(

      "The generated episode does not have a cliffhanger.",

    );

  }



  if (!episode.scenes.length) {

    throw new Error(

      "The generated episode does not contain a valid storyboard.",

    );

  }



  const storyboardDuration =

    episode.scenes.reduce(

      (total, scene) =>

        total +

        Number(

          scene.duration_seconds,

        ),

      0,

    );



  if (

    storyboardDuration !== duration

  ) {

    throw new Error(

      `The generated storyboard is ${storyboardDuration} seconds instead of ${duration} seconds.`,

    );

  }

}



export async function POST(request) {

  try {

    if (!process.env.OPENAI_API_KEY) {

      return NextResponse.json(

        {

          success: false,

          message:

            "OPENAI_API_KEY is not configured.",

        },

        {

          status: 500,

        },

      );

    }



    const body = await request.json();



    const seriesTitle =

      cleanText(

        body.seriesTitle ||

          body.series?.title,

      );



    const genre =

      cleanText(

        body.genre ||

          body.series?.genre,

        "Drama",

      );



    const platform =

      cleanText(

        body.platform ||

          body.series?.platform,

        "TikTok",

      );



    const episodeNumber =

      normaliseEpisodeNumber(

        body.episodeNumber,

      );



    const duration =

      normaliseDuration(

        body.durationSeconds ||

          body.duration,

      );



    const generationMode =

      ["economy", "standard", "cinematic"].includes(

        body.generationMode,

      )

        ? body.generationMode

        : "economy";



    const previousEpisode =

      body.previousEpisode || null;



    const creatorDirection =

      cleanText(

        body.creatorDirection ||

          body.storyIdea,

      );



    const continuity =

      normaliseContinuity(

        body.continuity,

      );



    if (!seriesTitle) {

      return NextResponse.json(

        {

          success: false,

          message:

            "A series title is required.",

        },

        {

          status: 400,

        },

      );

    }



    if (

      episodeNumber > 1 &&

      !previousEpisode

    ) {

      return NextResponse.json(

        {

          success: false,

          message:

            "The previous episode is required when continuing a series.",

        },

        {

          status: 400,

        },

      );

    }



    const model =

      process.env

        .OPENAI_STORY_MODEL ||

      "gpt-5.6-terra";



    const response =

      await openai.responses.create({

        model,

        instructions:

          buildSystemPrompt(),

        input: buildUserPrompt({

          seriesTitle,

          genre,

          platform,

          episodeNumber,

          duration,

          generationMode,

          creatorDirection,

          previousEpisode,

          continuity,

        }),

        text: {

          format: {

            type: "json_schema",

            name: "drama_episode",

            strict: true,

            schema: episodeSchema,

          },

        },

      });



    if (!response.output_text) {

      throw new Error(

        "The story model returned an empty response.",

      );

    }



    let parsedEpisode;



    try {

      parsedEpisode = JSON.parse(

        response.output_text,

      );

    } catch {

      throw new Error(

        "The story model returned invalid structured data.",

      );

    }



    const episode =

      normaliseEpisode(

        parsedEpisode,

        duration,

      );



    validateEpisode(

      episode,

      duration,

    );



    return NextResponse.json({

      success: true,

      model,

      episodeNumber,

      duration,

      episode,

    });

  } catch (error) {

    console.error(

      "DramaAI story generation error:",

      error,

    );



    return NextResponse.json(

      {

        success: false,

        message:

          error?.message ||

          "DramaAI could not generate the episode.",

      },

      {

        status: 500,

      },

    );

  }

}