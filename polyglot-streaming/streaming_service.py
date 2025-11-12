import asyncio
import boto3
import json
import base64
import os
import requests
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent
import websockets

OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_BUCKET = os.environ.get('S3_BUCKET', 'polyglot-mvp-audio')

transcribe_client = TranscribeStreamingClient(region=AWS_REGION)
polly_client = boto3.client('polly', region_name=AWS_REGION)
s3_client = boto3.client('s3', region_name=AWS_REGION)

print(f"🔧 Initialized with S3 bucket: {S3_BUCKET}")

# Store active rooms and their users
active_rooms = {}

class TranscriptHandler(TranscriptResultStreamHandler):
    def __init__(self, output_stream, session_id, source_lang, user_lang, websocket, room_id, user_name):
        super().__init__(output_stream)
        self.session_id = session_id
        self.source_lang = source_lang
        self.user_lang = user_lang
        self.websocket = websocket
        self.room_id = room_id
        self.user_name = user_name
        self.accumulated_text = ""
        self.last_send_time = asyncio.get_event_loop().time()
        
    async def handle_transcript_event(self, transcript_event: TranscriptEvent):
        results = transcript_event.transcript.results
        
        for result in results:
            if not result.is_partial:
                for alt in result.alternatives:
                    text = alt.transcript.strip()
                    
                    if not text:
                        continue
                    
                    if self.accumulated_text:
                        self.accumulated_text += " " + text
                    else:
                        self.accumulated_text = text
                    
                    current_time = asyncio.get_event_loop().time()
                    time_since_last = current_time - self.last_send_time
                    
                    should_send = (
                        time_since_last > 10 or
                        len(self.accumulated_text) > 200
                    )
                    
                    if should_send:
                        final_text = self.accumulated_text.strip()
                        print(f"🗣️ [{self.user_name}] Transcribed ({self.source_lang}): {final_text}")
                        
                        await self.broadcast_to_room(final_text)
                        
                        self.accumulated_text = ""
                        self.last_send_time = current_time
    
    async def broadcast_to_room(self, original_text):
        """Broadcast transcript to all users in the room with their preferred translations"""
        
        if self.room_id not in active_rooms:
            print(f"⚠️ Room {self.room_id} not found")
            return
        
        room_users = active_rooms[self.room_id]
        print(f"📢 Broadcasting to {len(room_users)} users in room {self.room_id}")
        
        # Translate to all languages needed in the room
        target_languages = set()
        for ws, user_info in room_users:
            target_languages.add(user_info['userLanguage'])
        
        target_languages.discard(self.source_lang)
        
        translations = {}
        for target_lang in target_languages:
            translation = await self.translate_with_openai(original_text, target_lang)
            translations[target_lang] = translation
        
        translations[self.source_lang] = original_text
        
        # Generate audio for each language
        audio_urls = {}
        for lang, text in translations.items():
            audio_url = await self.generate_speech(text, lang)
            audio_urls[lang] = audio_url
        
        # Send to each user in their preferred language
        for ws, user_info in room_users:
            try:
                target_lang = user_info['userLanguage']
                
                message = {
                    'type': 'transcript',
                    'speaker': self.user_name,
                    'speakerLanguage': self.source_lang,
                    'original': original_text,
                    'sourceLanguage': self.source_lang,
                    'translation': translations.get(target_lang, original_text),
                    'audioUrl': audio_urls.get(target_lang, '')
                }
                
                await ws.send(json.dumps(message))
                print(f"  → Sent to {user_info['userName']} ({target_lang}): {translations.get(target_lang, original_text)[:50]}...")
                
            except Exception as e:
                print(f"❌ Failed to send to user: {e}")
    
    async def translate_with_openai(self, text, target_lang):
        lang_names = {'en': 'English', 'es': 'Spanish', 'fr': 'French', 'hi': 'Hindi'}
        
        if self.source_lang == target_lang:
            return text
        
        prompt = f"Translate this {lang_names[self.source_lang]} text to {lang_names[target_lang]}. Preserve idioms and cultural context. Provide ONLY the translation, no explanations.\n\nText: \"{text}\""

        try:
            headers = {
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            
            data = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are a professional translator. Provide only the translation, no explanations."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 200
            }
            
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=data,
                timeout=10
            )
            
            response.raise_for_status()
            translation = response.json()["choices"][0]["message"]["content"].strip()
            
            return translation
            
        except Exception as e:
            print(f"❌ Translation error: {e}")
            return text
    
    async def generate_speech(self, text, lang):
        voice_map = {'en': 'Joanna', 'es': 'Lupe', 'fr': 'Celine', 'hi': 'Aditi'}
        
        if not text:
            return ''
        
        try:
            engine = 'neural' if lang in ['en', 'es'] else 'standard'
            
            response = polly_client.synthesize_speech(
                Text=text,
                OutputFormat='mp3',
                VoiceId=voice_map[lang],
                Engine=engine
            )
            
            timestamp = int(asyncio.get_event_loop().time() * 1000)
            s3_key = f"output/{lang}-{timestamp}.mp3"
            
            s3_client.put_object(
                Bucket=S3_BUCKET,
                Key=s3_key,
                Body=response['AudioStream'].read(),
                ContentType='audio/mpeg'
            )
            
            audio_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': S3_BUCKET, 'Key': s3_key},
                ExpiresIn=3600
            )
            
            return audio_url
            
        except Exception as e:
            print(f"❌ Speech error ({lang}): {e}")
            return ''

async def broadcast_participant_update(room_id):
    """Broadcast updated participant list to all users in room"""
    if room_id not in active_rooms:
        return
    
    participants = [
        {
            'userName': info['userName'],
            'speakLanguage': info['sourceLanguage'],
            'hearLanguage': info['userLanguage']
        }
        for ws, info in active_rooms[room_id]
    ]
    
    message = {
        'type': 'participants',
        'participants': participants
    }
    
    for ws, user_info in active_rooms[room_id]:
        try:
            await ws.send(json.dumps(message))
        except Exception as e:
            print(f"❌ Failed to send participant update: {e}")

async def handle_client(websocket, path):
    session_id = None
    stream = None
    room_id = None
    user_info = None
    
    try:
        init_msg = await websocket.recv()
        init_data = json.loads(init_msg)
        
        session_id = init_data['sessionId']
        source_lang = init_data['userLanguage']
        user_lang = init_data.get('targetLanguage', 'en')
        room_id = init_data.get('roomId', 'test')
        user_name = init_data.get('userName', 'User')
        
        # Add user to room
        user_info = {
            'sessionId': session_id,
            'userName': user_name,
            'sourceLanguage': source_lang,
            'userLanguage': user_lang
        }
        
        if room_id not in active_rooms:
            active_rooms[room_id] = []
        
        active_rooms[room_id].append((websocket, user_info))
        
        print(f"🟢 [{session_id}] {user_name} joined room {room_id}")
        print(f"👥 Room {room_id} now has {len(active_rooms[room_id])} users")
        print(f"🎤 Speaks: {source_lang}, Hears: {user_lang}")
        
        # ✅ Broadcast participant update
        await broadcast_participant_update(room_id)
        
        lang_map = {
            'en': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR',
            'hi': 'hi-IN'
        }
        
        transcribe_lang = lang_map.get(source_lang, 'en-US')
        print(f"🎤 Using Transcribe language: {transcribe_lang}")
        
        stream = await transcribe_client.start_stream_transcription(
            language_code=transcribe_lang,
            media_sample_rate_hz=16000,
            media_encoding="pcm"
        )
        
        handler = TranscriptHandler(
            stream.output_stream, 
            session_id, 
            source_lang, 
            user_lang, 
            websocket,
            room_id,
            user_name
        )
        
        async def write_audio():
            try:
                async for message in websocket:
                    audio_data = base64.b64decode(message)
                    await stream.input_stream.send_audio_event(audio_chunk=audio_data)
            except websockets.exceptions.ConnectionClosed:
                print(f"🔴 [{session_id}] Connection closed")
            finally:
                await stream.input_stream.end_stream()
        
        await asyncio.gather(write_audio(), handler.handle_events())
        
    except Exception as e:
        print(f"❌ [{session_id}] Error: {e}")
        import traceback
        traceback.print_exc()
        
        # ✅ Don't disconnect on timeout - keep connection alive
        if "timed out" in str(e):
            print(f"⚠️ Timeout for {session_id}, but keeping WebSocket open")
            # Don't close websocket, just log it
        else:
            raise  # Only raise for real errors
    
    finally:
        # Remove user from room
        if room_id and room_id in active_rooms:
            active_rooms[room_id] = [
                (ws, info) for ws, info in active_rooms[room_id] 
                if ws != websocket
            ]
            
            if len(active_rooms[room_id]) == 0:
                del active_rooms[room_id]
                print(f"🗑️ Room {room_id} is now empty and removed")
            else:
                print(f"👥 Room {room_id} now has {len(active_rooms[room_id])} users")
                # ✅ Broadcast participant update after someone leaves
                await broadcast_participant_update(room_id)

async def main():
    print("🚀 Polyglot Streaming Service Starting...")
    print(f"📡 Listening on port 8080")
    print(f"🔑 OpenAI API key: {'✅ Set' if OPENAI_API_KEY else '❌ Missing'}")
    print("👥 Room broadcasting enabled!")
    
    async with websockets.serve(handle_client, "0.0.0.0", 8080):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())