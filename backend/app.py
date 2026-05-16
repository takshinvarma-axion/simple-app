import os
from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
from openai import OpenAI, RateLimitError
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

# Primary model from env, then fallbacks — tried in order on 429.
_primary = os.environ.get("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
_fallbacks = [
    "google/gemma-4-31b-it:free",
    "deepseek/deepseek-v4-flash:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "arcee-ai/trinity-large-thinking:free",
    "poolside/laguna-xs.2:free",
    "poolside/laguna-m.1:free",
    "baidu/cobuddy:free",
]
# Deduplicate, primary first
seen = {_primary}
MODELS = [_primary]
for m in _fallbacks:
    if m not in seen:
        seen.add(m)
        MODELS.append(m)

ERROR_PREFIX = "\x00ERR:"


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    messages = data.get("messages")
    if not messages or not isinstance(messages, list):
        return jsonify({"error": "messages array required"}), 400

    # Drop any empty-content messages that can corrupt the model's context.
    messages = [m for m in messages if str(m.get("content", "")).strip()]

    def generate():
        for model in MODELS:
            try:
                stream = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    stream=True,
                )
                yielded = False
                for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        yielded = True
                        yield delta.content
                if not yielded:
                    # Empty response — try next model
                    continue
                return  # Done successfully
            except RateLimitError:
                # 429 from this model — silently try the next one
                continue
            except Exception as exc:
                yield ERROR_PREFIX + str(exc)
                return

        yield ERROR_PREFIX + "All free models are rate-limited. Please try again in a moment."

    return Response(stream_with_context(generate()), mimetype="text/plain")


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "models": MODELS})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
