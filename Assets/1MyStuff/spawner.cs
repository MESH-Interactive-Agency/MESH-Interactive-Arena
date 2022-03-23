using System.Collections;
using UnityEngine;

public class spawner : MonoBehaviour
{
    public GameObject[] cubes;
    public Transform[] points;
    public float bpm;
    public float startDelay;
    public float endTime;
    public GameObject self;

    public AudioSource song;
    private int _beat;

    private int _difficulty;
    private float _difficultyTimer;
    private bool _isPlaying;
    private float _songTime;
    private float _timer;

    // Start is called before the first frame update
    private void Start()
    {
        _difficulty = 3;
        _songTime = 0f;
        _isPlaying = false;
        _beat = 0;
        SpawnCube();
    }

    // Update is called once per frame
    private void Update()
    {
        if (_songTime > 0 && !_isPlaying)
        {
            song.Play();
            _isPlaying = true;
        }


        if (_difficultyTimer > endTime / 4)
        {
            _difficulty--;
            _difficultyTimer = 0f;
        }

        if (_timer > 60 / bpm)
        {
            _beat++;
            FindObjectOfType<Scoreboard>().UpdateSongTime(_beat);
            if (Random.Range(0, _difficulty) == 0 && _songTime < endTime) SpawnCube();

            _timer -= 60 / bpm;
        }

        if (_songTime > endTime + startDelay)
        {
            FindObjectOfType<Scoreboard>().EndGame();
            Destroy(self);
        }


        _timer += Time.deltaTime;
        _songTime += Time.deltaTime;
        _difficultyTimer += Time.deltaTime;
        FindObjectOfType<Scoreboard>().UpdateSongTime(_beat);
    }


    private void SpawnCube()
    {
        var cube = Instantiate(cubes[Random.Range(0, 4)], points[Random.Range(0, 8)]);
        cube.transform.localPosition = Vector3.zero;
        cube.transform.Rotate(transform.forward, 45 * Random.Range(0, 8));

        StartCoroutine(DestroyDebris(cube));

        IEnumerator DestroyDebris(GameObject o)
        {
            yield return new WaitForSeconds(30.0f);
            Destroy(o);
        }
    }
}
