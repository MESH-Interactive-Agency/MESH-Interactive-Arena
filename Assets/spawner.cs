using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class spawner : MonoBehaviour
{
    public GameObject[] cubes;
    public Transform[] points;
    public float beat = 60/100;
    private float timer;
    
    
    
    // Start is called before the first frame update
    void Start()
    {
        
    }

    // Update is called once per frame
    void Update()
    {
        if (timer > beat )
        {

            if (Random.Range(0, 4) == 1)
            {
                GameObject cube = Instantiate(cubes[Random.Range(0, 2)], points[Random.Range(0, 8)]);
                cube.transform.localPosition = Vector3.zero;
                cube.transform.Rotate(transform.forward, 45 * Random.Range(0, 8));



                StartCoroutine(DestroyDebris(cube));

                IEnumerator DestroyDebris(GameObject o)
                {
                    yield return new WaitForSeconds(30.0f);
                    Destroy(o);

                }

            }

            timer -= beat;
        }

        timer += Time.deltaTime;
        
    }
}
