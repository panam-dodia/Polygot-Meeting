FROM python:3.11-slim

WORKDIR /app

# Copy requirements first (for caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY streaming_service.py .

# Expose port
EXPOSE 8080

# Run the service
CMD ["python", "streaming_service.py"]